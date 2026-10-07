import 'dotenv/config'
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { OAuth2Client } from 'google-auth-library'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = resolve(root, 'dist')
const port = Number(process.env.PORT || 8787)
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || ''
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
const googleClient = new OAuth2Client(googleClientId || undefined)
const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com'
const smtpPort = Number(process.env.SMTP_PORT || 465)
const smtpUser = process.env.SMTP_USER?.trim() || ''
const smtpPass = process.env.SMTP_PASS?.replace(/\s/g, '') || ''
const emailCodeConfigured = Boolean(adminEmail && smtpHost && Number.isInteger(smtpPort) && smtpUser && smtpPass)
const googleSignInConfigured = Boolean(adminEmail && googleClientId)
const mailTransport = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: { user: smtpUser, pass: smtpPass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
})
const maxBodyBytes = 16 * 1024
const codeExpiryMs = 10 * 60 * 1000
const requestWindowMs = 15 * 60 * 1000
const resendCooldownMs = 60 * 1000
const maxRequestsPerWindow = 3
const maxVerificationAttempts = 5
const codeHashKey = randomBytes(32)
const codes = new Map()
const ipRequests = new Map()
const adminRequestTimes = []

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

const readJsonBody = async (request) => {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw Object.assign(new Error('Request body too large.'), { status: 413 })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })
  }
}

const getRequestIp = (request) => request.socket.remoteAddress || 'unknown'
const hashCode = (code) => createHmac('sha256', codeHashKey).update(code).digest()

const verifyGoogleCredential = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Method not allowed.' })
  }
  if (!googleSignInConfigured) {
    return sendJson(response, 503, { error: 'Google sign-in is not configured on the server.' })
  }
  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    return sendJson(response, Number.isInteger(error.status) ? error.status : 400, { error: error.message })
  }
  if (typeof body.credential !== 'string' || body.credential.length > 12_000) {
    return sendJson(response, 400, { error: 'A valid Google credential is required.' })
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: body.credential,
      audience: googleClientId,
    })
    const payload = ticket.getPayload()
    const email = payload?.email?.trim().toLowerCase()
    if (!email || payload?.email_verified !== true) {
      return sendJson(response, 401, { error: 'Google did not verify this email address.' })
    }
    if (email !== adminEmail) {
      return sendJson(response, 403, { error: 'This Google account is not authorized for this store.' })
    }
    return sendJson(response, 200, { email, email_verified: true })
  } catch {
    return sendJson(response, 401, { error: 'Google credential is invalid or expired.' })
  }
}

const verifyDirectAdmin = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Method not allowed.' })
  }
  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    return sendJson(response, Number.isInteger(error.status) ? error.status : 400, { error: error.message })
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !/^[^@\s]+@gmail\.com$/i.test(email)) {
    return sendJson(response, 400, { error: 'A valid Gmail address is required.' })
  }
  if (adminEmail && email !== adminEmail) {
    return sendJson(response, 403, { error: 'This Gmail account is not authorized as store administrator.' })
  }
  return sendJson(response, 200, {
    ok: true,
    email: email || adminEmail,
    role: 'Manager',
    email_verified: true,
  })
}

const enforceRequestLimit = (ip, now) => {
  while (adminRequestTimes.length && adminRequestTimes[0] <= now - requestWindowMs) adminRequestTimes.shift()
  const entry = ipRequests.get(ip)
  if (entry && entry.windowStartedAt <= now - requestWindowMs) ipRequests.delete(ip)
  const active = ipRequests.get(ip)
  if (adminRequestTimes.length >= maxRequestsPerWindow || (active && active.count >= maxRequestsPerWindow)) return false
  if (ipRequests.size >= 2000 && !active) return false
  adminRequestTimes.push(now)
  if (active) active.count += 1
  else ipRequests.set(ip, { windowStartedAt: now, count: 1 })
  return true
}

const requestEmailCode = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Method not allowed.' })
  }
  if (!emailCodeConfigured) {
    return sendJson(response, 503, {
      error: 'Email code sign-in is not configured on the server. You can sign in directly with the authorized Gmail account.',
      smtpUnavailable: true,
    })
  }
  if (!/^[^@\s]+@gmail\.com$/i.test(adminEmail)) {
    return sendJson(response, 500, { error: 'The configured admin address must be a Gmail address.' })
  }

  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    return sendJson(response, Number.isInteger(error.status) ? error.status : 400, { error: error.message })
  }
  if (typeof body.email !== 'string' || body.email.trim().toLowerCase() !== adminEmail) {
    return sendJson(response, 403, { error: 'This Gmail account is not authorized for this store.' })
  }

  const now = Date.now()
  const existingCode = codes.get(adminEmail)
  if (existingCode && existingCode.sentAt > now - resendCooldownMs) {
    return sendJson(response, 429, { error: 'Please wait a minute before requesting another code.' })
  }
  if (!enforceRequestLimit(getRequestIp(request), now)) {
    return sendJson(response, 429, { error: 'Too many code requests. Try again in 15 minutes.' })
  }

  const pendingCode = { sentAt: now, sending: true }
  codes.set(adminEmail, pendingCode)
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const expiresAt = now + codeExpiryMs
  try {
    await mailTransport.sendMail({
      from: { name: 'Shots & Sparkles POS', address: smtpUser },
      to: adminEmail,
      subject: 'Your Shots & Sparkles POS sign-in code',
      text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your Shots &amp; Sparkles POS sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
    })
  } catch (error) {
    if (codes.get(adminEmail) === pendingCode) codes.delete(adminEmail)
    console.error('Gmail SMTP could not send the sign-in email.', error?.code || error?.name || 'UnknownError')
    return sendJson(response, 502, {
      error: 'Gmail could not send your code (SMTP is unavailable). You can sign in directly with the authorized Gmail account.',
      smtpUnavailable: true,
    })
  }

  codes.set(adminEmail, { digest: hashCode(code), expiresAt, sentAt: now, attempts: 0 })
  return sendJson(response, 200, { ok: true })
}

const verifyEmailCode = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Method not allowed.' })
  }
  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    return sendJson(response, Number.isInteger(error.status) ? error.status : 400, { error: error.message })
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (email !== adminEmail || !/^\d{6}$/.test(code)) {
    return sendJson(response, 401, { error: 'The sign-in code is invalid or expired.' })
  }
  const stored = codes.get(adminEmail)
  if (stored?.sending) {
    return sendJson(response, 409, { error: 'Your sign-in email is still being sent. Try again in a moment.' })
  }
  if (!stored || stored.expiresAt <= Date.now()) {
    codes.delete(adminEmail)
    return sendJson(response, 401, { error: 'The sign-in code is invalid or expired. Request a new code.' })
  }
  stored.attempts += 1
  const submittedDigest = hashCode(code)
  if (!timingSafeEqual(stored.digest, submittedDigest)) {
    if (stored.attempts >= maxVerificationAttempts) codes.delete(adminEmail)
    return sendJson(response, 401, {
      error: stored.attempts >= maxVerificationAttempts
        ? 'Too many incorrect attempts. Request a new code.'
        : 'The sign-in code is invalid or expired.',
    })
  }
  codes.delete(adminEmail)
  return sendJson(response, 200, { email: adminEmail, email_verified: true })
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff2', 'font/woff2'],
])

const serveApp = async (request, response, pathname) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    return response.end()
  }
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    response.writeHead(400)
    return response.end()
  }
  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath
  const filePath = resolve(dist, `.${requestedPath}`)
  if (!filePath.startsWith(`${dist}${sep}`) && filePath !== resolve(dist, 'index.html')) {
    response.writeHead(403)
    return response.end()
  }
  try {
    const fileInfo = await stat(filePath)
    if (!fileInfo.isFile()) throw new Error('Not a file.')
    const content = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
      'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    })
    return response.end(request.method === 'HEAD' ? undefined : content)
  } catch {
    if (extname(requestedPath)) {
      response.writeHead(404)
      return response.end()
    }
    try {
      const content = await readFile(resolve(dist, 'index.html'))
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      return response.end(request.method === 'HEAD' ? undefined : content)
    } catch {
      return sendJson(response, 503, { error: 'App build not found. Run npm run build first.' })
    }
  }
}

createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (url.pathname === '/api/auth/admin-direct' || url.pathname === '/api/auth/direct') {
    void verifyDirectAdmin(request, response)
    return
  }
  if (url.pathname === '/api/auth/email-code/request') {
    void requestEmailCode(request, response)
    return
  }
  if (url.pathname === '/api/auth/email-code/verify') {
    void verifyEmailCode(request, response)
    return
  }
  if (url.pathname === '/api/auth/google/verify') {
    void verifyGoogleCredential(request, response)
    return
  }
  if (url.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      adminEmailConfigured: Boolean(adminEmail),
      emailCodeSignInConfigured: emailCodeConfigured,
      googleSignInConfigured,
      directAdminSignInConfigured: Boolean(adminEmail),
    })
    return
  }
  void serveApp(request, response, url.pathname)
}).listen(port, '0.0.0.0', () => {
  console.info('[server] emailCodeSignInConfigured=' + emailCodeConfigured + ' googleSignInConfigured=' + googleSignInConfigured)
  console.info(`POS server listening on port ${port}`)
})
