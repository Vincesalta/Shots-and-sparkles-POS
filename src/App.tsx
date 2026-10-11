import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Archive, ArrowDownToLine, ArrowRight, BarChart3, Bell, Check, Cloud, CloudOff, ImagePlus,
  ChevronDown, CircleHelp, Clock3, Coffee, CreditCard, FileText, LayoutDashboard, LogOut,
  Minus, Pause, Plus, Printer, Search, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles,
  Pencil, RefreshCw, Tag, Trash2, UserRound, Users, Wallet, X,
} from 'lucide-react'
import { categories, initialProducts, money, type CategoryId, type Product } from './menu'
import { syncStore } from './sync'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

type Role = 'Manager' | 'Cashier'
type AuthSession = { user: string; role: Role; lastActivityAt: number }
type PaymentMethod = 'Cash' | 'GCash'
type View = 'pos' | 'dashboard' | 'products' | 'inventory' | 'customers' | 'orders' | 'staff' | 'reports' | 'activity' | 'settings'
type CartItem = { key: string; productId: string; name: string; category: CategoryId; variant: string; price: number; sugar: string; addons: string[]; quantity: number; imageData?: string }
type Transaction = { id: string; date: string; items: CartItem[]; total: number; method: string; cashier: string; reference?: string; discount: number; customerId?: string; customerName?: string }
type HeldOrder = { id: string; label: string; createdAt: string; items: CartItem[]; discount: number; customerId: string }
type StockItem = { id: string; name: string; quantity: number; unit: string; low: number }
type StockMovement = { id: string; date: string; itemId: string; itemName: string; action: 'Restock' | 'Adjustment' | 'Sale' | 'Deleted'; change: number; balance: number; actor: string }
type Customer = { id: string; name: string; phone: string; email: string; notes: string; active: boolean }
type AddOn = { id: string; name: string; price: number; active: boolean }
type StaffMember = { name: string; role: Role; status: 'Active' | 'On leave' }
type GoogleIdentityApi = { accounts: { id: { initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void; prompt: () => void } } }
declare global { interface Window { google?: GoogleIdentityApi } }
const categoriesLabels = Object.fromEntries(categories.map((category) => [category.id, category.shortLabel])) as Record<CategoryId, string>
const sameLocalDay = (date: string, reference: Date) => new Date(date).toDateString() === reference.toDateString()
const isWithinPeriod = (date: string, start: Date, end: Date) => new Date(date) >= start && new Date(date) <= end
const periodStart = (reference: Date, range: 'daily' | 'weekly' | 'monthly') => {
  const start = new Date(reference)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (range === 'monthly' ? 29 : range === 'weekly' ? 6 : 0))
  return start
}
const currentTimestamp = () => new Date().toLocaleString()
const dateFieldValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
const authSessionKey = 'ss-auth-session'
const authSessionTimeoutMs = 5 * 60 * 1000
const gcashNumber = '09102733236'
const syncEndpoint = import.meta.env.VITE_SYNC_API_URL?.trim() || ''
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''
const googleAuthVerifyUrl = '/api/auth/google/verify'
const loadProducts = (): Product[] => {
  const saved = JSON.parse(localStorage.getItem('ss-products') || 'null') as Product[] | null
  const source = saved || initialProducts
  return source.map((item) => {
    const variants = item.variants.map((variant) => ({
      ...variant,
      name: variant.name.replace(/\s*[·-]\s*(12|16|22)oz$/i, ''),
    }))
    if (item.id === 'juice-lemon-tea') {
      const currentPrices: Record<string, number> = { Small: 39, Medium: 49, Large: 59 }
      for (const [name, price] of Object.entries(currentPrices)) {
        const existing = variants.find((variant) => variant.name === name)
        if (existing) existing.price = price
        else variants.push({ name, price })
      }
      variants.sort((first, second) => ['Small', 'Medium', 'Large'].indexOf(first.name) - ['Small', 'Medium', 'Large'].indexOf(second.name))
    }
    return { ...item, variants }
  })
}
const getDeviceId = () => {
  const stored = localStorage.getItem('ss-device-id')
  if (stored) return stored
  const id = crypto.randomUUID?.() || `ss-${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem('ss-device-id', id)
  return id
}
const initialStock: StockItem[] = [
  { id: 'cups-12', name: '12oz cups', quantity: 86, unit: 'pcs', low: 30 },
  { id: 'cups-16', name: '16oz cups', quantity: 112, unit: 'pcs', low: 35 },
  { id: 'cups-22', name: '22oz cups', quantity: 28, unit: 'pcs', low: 30 },
  { id: 'beans', name: 'Coffee beans', quantity: 3.6, unit: 'kg', low: 1.5 },
  { id: 'matcha', name: 'Matcha powder', quantity: 1.2, unit: 'kg', low: 0.5 },
  { id: 'milk', name: 'Fresh milk', quantity: 8, unit: 'L', low: 4 },
  { id: 'syrup', name: 'Syrup base', quantity: 5, unit: 'L', low: 2 },
]
const initialStaff: StaffMember[] = [
  { name: 'Mia Santos', role: 'Manager', status: 'Active' },
  { name: 'Alex Rivera', role: 'Cashier', status: 'Active' },
  { name: 'Sam Flores', role: 'Cashier', status: 'Active' },
]
const initialAddOns: AddOn[] = [
  { id: 'extra-shot', name: 'Extra shot', price: 10, active: true },
  { id: 'cream', name: 'Cream', price: 10, active: true },
]
const loadAuthSession = (): AuthSession | null => {
  const saved = localStorage.getItem(authSessionKey)
  if (saved) {
    try {
      const session = JSON.parse(saved) as Partial<AuthSession>
      if (typeof session.user === 'string' && (session.role === 'Manager' || session.role === 'Cashier') &&
        typeof session.lastActivityAt === 'number' && Number.isFinite(session.lastActivityAt) &&
        session.lastActivityAt <= Date.now() && Date.now() - session.lastActivityAt < authSessionTimeoutMs) {
        return session as AuthSession
      }
    } catch {
      localStorage.removeItem(authSessionKey)
      sessionStorage.removeItem('ss-user')
      sessionStorage.removeItem('ss-role')
      return null
    }
    localStorage.removeItem(authSessionKey)
    sessionStorage.removeItem('ss-user')
    sessionStorage.removeItem('ss-role')
    return null
  }
  const legacyUser = sessionStorage.getItem('ss-user')
  const legacyRole = sessionStorage.getItem('ss-role')
  if (legacyUser && (legacyRole === 'Manager' || legacyRole === 'Cashier')) {
    return { user: legacyUser, role: legacyRole, lastActivityAt: Date.now() }
  }
  return null
}
function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo-mark${compact ? ' compact' : ''}`} aria-label="Shots and Sparkles">
      <img src="/shots-sparkles.svg" alt="Shots & Sparkles logo" />
    </div>
  )
}

function App() {
  const [products, setProducts] = useState<Product[]>(loadProducts)
  const [transactions, setTransactions] = useState<Transaction[]>(() => JSON.parse(localStorage.getItem('ss-transactions') || '[]'))
  const [stock, setStock] = useState<StockItem[]>(() => JSON.parse(localStorage.getItem('ss-stock') || 'null') || initialStock)
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => JSON.parse(localStorage.getItem('ss-stock-movements') || '[]'))
  const [customers, setCustomers] = useState<Customer[]>(() => JSON.parse(localStorage.getItem('ss-customers') || '[]'))
  const [staff, setStaff] = useState<StaffMember[]>(() => JSON.parse(localStorage.getItem('ss-staff') || 'null') || initialStaff)
  const [addOns, setAddOns] = useState<AddOn[]>(() => JSON.parse(localStorage.getItem('ss-addons') || 'null') || initialAddOns)
  const [addOnDraft, setAddOnDraft] = useState<{ id: string | null; name: string; price: string }>({ id: null, name: '', price: '10' })
  const [audit, setAudit] = useState<string[]>(() => JSON.parse(localStorage.getItem('ss-audit') || '[]'))
  const [authSession, setAuthSession] = useState<AuthSession | null>(loadAuthSession)
  const user = authSession?.user || ''
  const role = authSession?.role || 'Manager'
  const [now] = useState(() => new Date())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<'local' | 'pending' | 'syncing' | 'synced' | 'error'>(() => syncEndpoint ? (localStorage.getItem('ss-sync-fingerprint') ? 'synced' : 'pending') : 'local')
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem('ss-last-synced-at') || '')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const syncInFlight = useRef(false)
  const syncQueued = useRef(false)
  const [view, setView] = useState<View>('pos')
  const [reportRange, setReportRange] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily')
  const [reportFrom, setReportFrom] = useState(() => dateFieldValue(new Date()))
  const [reportTo, setReportTo] = useState(() => dateFieldValue(new Date()))
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [productListMode, setProductListMode] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => JSON.parse(localStorage.getItem('ss-held-orders') || '[]'))
  const [selected, setSelected] = useState<Product | null>(null)
  const [variantIndex, setVariantIndex] = useState(0)
  const [sugar, setSugar] = useState('100%')
  const [addons, setAddons] = useState<string[]>([])
  const [discount, setDiscount] = useState(0)
  const [promo, setPromo] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('Cash')
  const [cashReceived, setCashReceived] = useState('')
  const [receipt, setReceipt] = useState<Transaction | null>(null)
  const [modal, setModal] = useState<'product' | 'payment' | 'staff' | 'stock' | 'discount' | 'login' | 'new-product' | 'customer' | 'held-orders' | null>(null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState<Role>('Cashier')
  const [stockEdit, setStockEdit] = useState<StockItem | null>(null)
  const [notification, setNotification] = useState('')
  const [loginName, setLoginName] = useState('')
  const [adminEmailInput, setAdminEmailInput] = useState('')
  const [adminPasswordInput, setAdminPasswordInput] = useState('')
  const [loginStage, setLoginStage] = useState<'roles' | 'admin' | 'cashier'>('roles')
  const [adminCodeBusy, setAdminCodeBusy] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductPrice, setNewProductPrice] = useState('60')
  const [newProductCategory, setNewProductCategory] = useState<CategoryId>('coffee')
  const [newProductImage, setNewProductImage] = useState('')
  const [customDiscount, setCustomDiscount] = useState('')
  const [currentCustomerId, setCurrentCustomerId] = useState('')
  const [customerEdit, setCustomerEdit] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [ordersCustomerFilter, setOrdersCustomerFilter] = useState('')
  const [stockSearch, setStockSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all')

  useEffect(() => {
    localStorage.setItem('ss-products', JSON.stringify(products))
    localStorage.setItem('ss-transactions', JSON.stringify(transactions))
    localStorage.setItem('ss-held-orders', JSON.stringify(heldOrders))
    localStorage.setItem('ss-stock', JSON.stringify(stock))
    localStorage.setItem('ss-stock-movements', JSON.stringify(stockMovements))
    localStorage.setItem('ss-customers', JSON.stringify(customers))
    localStorage.setItem('ss-staff', JSON.stringify(staff))
    localStorage.setItem('ss-addons', JSON.stringify(addOns))
    localStorage.setItem('ss-audit', JSON.stringify(audit))
  }, [products, transactions, heldOrders, stock, stockMovements, customers, staff, addOns, audit])

  useEffect(() => {
    if (!user) return
    if (!authSession) return
    localStorage.setItem(authSessionKey, JSON.stringify(authSession))
    let lastActivityAt = authSession.lastActivityAt
    let timeout: number
    const expireIfInactive = () => {
      window.clearTimeout(timeout)
      const remaining = authSessionTimeoutMs - (Date.now() - lastActivityAt)
      if (remaining <= 0) {
        localStorage.removeItem(authSessionKey)
        sessionStorage.removeItem('ss-user')
        sessionStorage.removeItem('ss-role')
        setAuthSession(null)
        setNotification('Session ended after 5 minutes of inactivity. Please sign in again.')
        return
      }
      timeout = window.setTimeout(expireIfInactive, remaining)
    }
    const recordActivity = () => {
      const now = Date.now()
      if (now - lastActivityAt < 1000) return
      lastActivityAt = now
      const nextSession = { ...authSession, lastActivityAt }
      localStorage.setItem(authSessionKey, JSON.stringify(nextSession))
      setAuthSession(nextSession)
    }
    const checkOnResume = () => {
      if (document.visibilityState === 'visible') expireIfInactive()
    }
    const activityEvents = ['pointerdown', 'keydown', 'touchstart']
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }))
    document.addEventListener('visibilitychange', checkOnResume)
    expireIfInactive()
    return () => {
      window.clearTimeout(timeout)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity))
      document.removeEventListener('visibilitychange', checkOnResume)
    }
  }, [user, authSession])

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  const visibleProducts = useMemo(() => products.filter((item) => !item.archived && item.active &&
    (category === 'all' || item.category === category) && item.name.toLowerCase().includes(search.toLowerCase())), [products, category, search])
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const tax = Math.round(subtotal * 0.12 * 100) / 100
  const total = Math.max(0, subtotal + tax - discount)
  const todayTransactions = transactions.filter((item) => sameLocalDay(item.date, now))
  const todaySales = todayTransactions.reduce((sum, item) => sum + item.total, 0)
  const visibleTransactions = role === 'Manager' ? transactions : transactions.filter((item) => item.cashier === user)
  const visibleTodayTransactions = visibleTransactions.filter((item) => sameLocalDay(item.date, now))
  const selectedPeriodStart = reportRange === 'custom' ? new Date(`${reportFrom}T00:00:00`) : periodStart(now, reportRange)
  const selectedPeriodEnd = reportRange === 'custom' ? new Date(`${reportTo}T23:59:59.999`) : now
  const isValidReportPeriod = Number.isFinite(selectedPeriodStart.getTime()) && Number.isFinite(selectedPeriodEnd.getTime()) && selectedPeriodStart <= selectedPeriodEnd
  const periodTransactions = visibleTransactions.filter((item) => isValidReportPeriod && isWithinPeriod(item.date, selectedPeriodStart, selectedPeriodEnd))
  const reportPeriodLabel = reportRange === 'custom' ? `${reportFrom} to ${reportTo}` : reportRange
  const periodSales = periodTransactions.reduce((sum, item) => sum + item.total, 0)
  const lowStock = stock.filter((item) => item.quantity <= item.low)
  const snapshotFingerprint = JSON.stringify({ products, transactions, stock, stockMovements, customers, staff, audit })
  const snapshotIsSynced = snapshotFingerprint === localStorage.getItem('ss-sync-fingerprint')
  const syncLabel = !isOnline ? 'Offline · saved locally' : !syncEndpoint ? 'Online · device only' : syncStatus === 'syncing' ? 'Syncing…' : snapshotIsSynced || syncStatus === 'synced' ? 'Synced' : syncStatus === 'error' ? 'Sync failed · retry' : 'Waiting to sync'
  const syncTitle = lastSyncedAt ? `${syncLabel}. Last sync ${new Date(lastSyncedAt).toLocaleString()}` : `${syncLabel}. Configure VITE_SYNC_API_URL for cloud sync.`
  const selectedCustomer = customers.find((customer) => customer.id === currentCustomerId && customer.active)
  const selectedAddOnTotal = addons.reduce((sum, name) => sum + (addOns.find((item) => item.name === name)?.price || 0), 0)
  const appendStockMovement = (item: StockItem, change: number, action: StockMovement['action']) => setStockMovements((items) => [{
    id: `move-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    itemId: item.id,
    itemName: item.name,
    action,
    change,
    balance: item.quantity,
    actor: user || 'System',
  }, ...items].slice(0, 500))

  useEffect(() => {
    if (!syncEndpoint || !isOnline || snapshotIsSynced) return

    const timer = window.setTimeout(() => {
      if (syncInFlight.current) {
        syncQueued.current = true
        return
      }
      syncInFlight.current = true
      setSyncStatus('syncing')
      const sentAt = new Date().toISOString()
      void syncStore(syncEndpoint, {
        schemaVersion: 1,
        deviceId: getDeviceId(),
        sentAt,
        products,
        transactions,
        stock,
        stockMovements,
        customers,
        staff,
        audit,
      }).then((merged) => {
        if (JSON.stringify(merged.products) !== JSON.stringify(products)) setProducts(merged.products)
        if (JSON.stringify(merged.transactions) !== JSON.stringify(transactions)) setTransactions(merged.transactions as Transaction[])
        if (JSON.stringify(merged.stock) !== JSON.stringify(stock)) setStock(merged.stock as StockItem[])
        if (JSON.stringify(merged.stockMovements) !== JSON.stringify(stockMovements)) setStockMovements(merged.stockMovements as StockMovement[])
        if (JSON.stringify(merged.customers) !== JSON.stringify(customers)) setCustomers(merged.customers as Customer[])
        if (JSON.stringify(merged.staff) !== JSON.stringify(staff)) setStaff(merged.staff as StaffMember[])
        if (JSON.stringify(merged.audit) !== JSON.stringify(audit)) setAudit(merged.audit)
        const syncedAt = new Date().toISOString()
        localStorage.setItem('ss-sync-fingerprint', JSON.stringify({
          products: merged.products,
          transactions: merged.transactions,
          stock: merged.stock,
          stockMovements: merged.stockMovements,
          customers: merged.customers,
          staff: merged.staff,
          audit: merged.audit,
        }))
        localStorage.setItem('ss-last-synced-at', syncedAt)
        setLastSyncedAt(syncedAt)
        setSyncStatus('synced')
      }).catch(() => setSyncStatus('error')).finally(() => {
        syncInFlight.current = false
        if (syncQueued.current) {
          syncQueued.current = false
          setSyncAttempt((attempt) => attempt + 1)
        }
      })
    }, syncAttempt === 0 ? 700 : 0)

    return () => window.clearTimeout(timer)
  }, [isOnline, syncAttempt, snapshotFingerprint, snapshotIsSynced, products, transactions, stock, stockMovements, customers, staff, audit])
  const addAudit = (message: string) => setAudit((items) => [`${currentTimestamp()} · ${user || 'System'} · ${message}`, ...items].slice(0, 100))
  const notify = (message: string) => { setNotification(message); window.setTimeout(() => setNotification(''), 2500) }
  const printReceipt = () => {
    const clearPrintMode = () => document.body.classList.remove('receipt-print-mode')
    window.addEventListener('afterprint', clearPrintMode, { once: true })
    document.body.classList.add('receipt-print-mode')
    window.requestAnimationFrame(() => window.print())
  }
  const printReport = () => {
    const clearPrintMode = () => document.body.classList.remove('report-print-mode')
    window.addEventListener('afterprint', clearPrintMode, { once: true })
    document.body.classList.add('report-print-mode')
    window.requestAnimationFrame(() => window.print())
  }

  const startOrder = (item: Product) => {
    setSelected(item)
    setVariantIndex(0)
    setSugar('100%')
    setAddons([])
    setModal('product')
  }
  const addToCart = () => {
    if (!selected) return
    const variant = selected.variants[variantIndex]
    const extra = addons.reduce((sum, name) => sum + (addOns.find((item) => item.name === name)?.price || 0), 0)
    const key = `${selected.id}-${variant.name}-${sugar}-${addons.join(',')}`
    setCart((items) => {
      const existing = items.find((item) => item.key === key)
      return existing ? items.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item) :
        [...items, { key, productId: selected.id, name: selected.name, category: selected.category, variant: variant.name, price: variant.price + extra, sugar, addons, quantity: 1, imageData: selected.imageData }]
    })
    setModal(null)
  }
  const updateQuantity = (key: string, amount: number) => setCart((items) => items.map((item) => item.key === key ? { ...item, quantity: item.quantity + amount } : item).filter((item) => item.quantity > 0))
  const parkCurrentOrder = () => {
    if (!cart.length) return notify('Add an item before parking an order.')
    const heldOrder: HeldOrder = {
      id: `held-${Date.now()}`,
      label: `Order #${String(transactions.length + heldOrders.length + 1).padStart(4, '0')}`,
      createdAt: new Date().toISOString(),
      items: cart,
      discount,
      customerId: currentCustomerId,
    }
    setHeldOrders((orders) => [heldOrder, ...orders])
    setCart([])
    setDiscount(0)
    setCurrentCustomerId('')
    addAudit(`Parked ${heldOrder.label}`)
    notify('Order saved. You can resume it any time.')
  }
  const resumeHeldOrder = (heldOrder: HeldOrder) => {
    if (cart.length) {
      setHeldOrders((orders) => [{
        id: `held-${Date.now()}`,
        label: `Order #${String(transactions.length + orders.length + 1).padStart(4, '0')}`,
        createdAt: new Date().toISOString(),
        items: cart,
        discount,
        customerId: currentCustomerId,
      }, ...orders.filter((order) => order.id !== heldOrder.id)])
    } else {
      setHeldOrders((orders) => orders.filter((order) => order.id !== heldOrder.id))
    }
    setCart(heldOrder.items)
    setDiscount(heldOrder.discount)
    setCurrentCustomerId(heldOrder.customerId)
    setModal(null)
    addAudit(`Resumed ${heldOrder.label}`)
  }
  const checkout = () => {
    if (!cart.length) return notify('Add an item to start an order.')
    setModal('payment')
  }
  const completeSale = () => {
    if (payment === 'Cash' && Number(cashReceived) < total) return notify('Cash received must cover the total.')
    const sale: Transaction = { id: `SS-${Date.now().toString().slice(-8)}`, date: new Date().toISOString(), items: cart, total, method: payment, cashier: user, discount, customerId: selectedCustomer?.id, customerName: selectedCustomer?.name }
    setTransactions((items) => [sale, ...items])
    setReceipt(sale)
    setCart([])
    setDiscount(0)
    setCashReceived('')
    setCurrentCustomerId('')
    setModal(null)
    addAudit(`Completed order ${sale.id} · ${money(sale.total)}${sale.discount ? ` · discount ${money(sale.discount)}` : ''}`)
    const nextStock = stock.map((stockItem) => {
      if (!stockItem.id.startsWith('cups-')) return stockItem
      const sizeKey = stockItem.id === 'cups-12' ? /small|12oz/i : stockItem.id === 'cups-16' ? /medium|16oz/i : /large|22oz/i
      const used = cart.filter((line) => line.category !== 'dessert' && sizeKey.test(line.variant)).reduce((quantity, line) => quantity + line.quantity, 0)
      return used ? { ...stockItem, quantity: Math.max(0, stockItem.quantity - used) } : stockItem
    })
    const saleMovements = nextStock.flatMap((item) => {
      const previous = stock.find((oldItem) => oldItem.id === item.id)
      const change = item.quantity - (previous?.quantity ?? item.quantity)
      return change ? [{ id: `move-${Date.now()}-${item.id}`, date: new Date().toISOString(), itemId: item.id, itemName: item.name, action: 'Sale' as const, change, balance: item.quantity, actor: user }] : []
    })
    setStock(nextStock)
    if (saleMovements.length) setStockMovements((items) => [...saleMovements, ...items].slice(0, 500))
    setView('orders')
  }
  const createProduct = () => {
    const name = newProductName.trim()
    const price = Number(newProductPrice)
    if (!name || !Number.isFinite(price) || price <= 0) return notify('Enter a product name and valid price.')
    const added = { id: `custom-${Date.now()}`, name, category: newProductCategory, variants: [{ name: 'Regular', price }], imageData: newProductImage || undefined, active: true, archived: false }
    setProducts((items) => [...items, added])
    addAudit(`Created product ${name}`)
    setNewProductName('')
    setNewProductPrice('60')
    setNewProductCategory('coffee')
    setNewProductImage('')
    setModal(null)
  }
  const addTeamMember = () => {
    if (!newStaffName.trim()) return
    const member = { name: newStaffName.trim(), role: newStaffRole, status: 'Active' as const }
    setStaff((items) => [...items, member])
    addAudit(`Added staff member ${member.name}`)
    setNewStaffName('')
    setNewStaffRole('Cashier')
    setModal(null)
  }
  const saveCustomer = (customer: Customer) => {
    setCustomers((items) => customerEdit ? items.map((item) => item.id === customer.id ? customer : item) : [...items, customer])
    addAudit(`${customerEdit ? 'Updated' : 'Created'} customer ${customer.name}`)
    setCustomerEdit(null)
    setModal(null)
  }
  const saveAddOn = () => {
    const name = addOnDraft.name.trim()
    const price = Number(addOnDraft.price)
    if (!name || !Number.isFinite(price) || price < 0) return notify('Enter an add-on name and a valid non-negative price.')
    if (addOns.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== addOnDraft.id)) return notify('An add-on with that name already exists.')
    if (addOnDraft.id) {
      setAddOns((items) => items.map((item) => item.id === addOnDraft.id ? { ...item, name, price } : item))
      addAudit(`Updated add-on ${name}`)
    } else {
      setAddOns((items) => [...items, { id: `addon-${Date.now()}`, name, price, active: true }])
      addAudit(`Added add-on ${name}`)
    }
    setAddOnDraft({ id: null, name: '', price: '10' })
  }
  const deleteAddOn = (item: AddOn) => {
    setAddOns((items) => items.filter((entry) => entry.id !== item.id))
    addAudit(`Deleted add-on ${item.name}`)
  }
  const recordSignIn = (name: string, selectedRole: Role) => {
    const session = { user: name, role: selectedRole, lastActivityAt: Date.now() }
    localStorage.setItem(authSessionKey, JSON.stringify(session))
    setAuthSession(session)
    setAudit((items) => [`${currentTimestamp()} · ${name} (${selectedRole}) · Signed in`, ...items].slice(0, 100))
    setModal(null)
    setView('pos')
  }
  const verifyGoogleAdminCredential = async (credential: string) => {
    setAdminCodeBusy(true)
    try {
      const response = await fetch(googleAuthVerifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) })
      const result = await response.json() as { email?: unknown; email_verified?: unknown; error?: unknown }
      if (!response.ok) return notify(typeof result.error === 'string' ? result.error : 'Google sign-in could not be verified.')
      if (typeof result.email === 'string' && result.email_verified === true) recordSignIn(result.email.trim().toLowerCase(), 'Manager')
    } catch { notify('Could not contact the Google sign-in service. Check your connection and try again.') }
    finally { setAdminCodeBusy(false) }
  }
  const signInAdminWithPassword = async () => {
    const email = adminEmailInput.trim().toLowerCase()
    if (!email || !adminPasswordInput) return notify('Enter your Gmail and password.')
    setAdminCodeBusy(true)
    try {
      const response = await fetch('/api/auth/password/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: adminPasswordInput }) })
      const result = await response.json() as { email?: unknown; email_verified?: unknown; error?: unknown }
      if (!response.ok) return notify(typeof result.error === 'string' ? result.error : 'Gmail or password is incorrect.')
      if (typeof result.email === 'string' && result.email_verified === true) {
        setAdminPasswordInput('')
        recordSignIn(result.email, 'Manager')
      }
    } catch { notify('Could not contact the sign-in service. Check your connection and try again.') }
    finally { setAdminCodeBusy(false) }
  }
  useEffect(() => {
    if (modal !== 'login' || loginStage !== 'admin' || !googleClientId) return
    const initializeGoogleSignIn = () => {
      if (!window.google) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => void verifyGoogleAdminCredential(response.credential),
      })
    }
    const scriptId = 'google-identity-services'
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (window.google) {
      initializeGoogleSignIn()
      return
    } else {
      if (existingScript) {
        existingScript.addEventListener('load', initializeGoogleSignIn, { once: true })
        existingScript.addEventListener('error', () => notify('Google sign-in could not load. Check your connection and try again.'), { once: true })
        return () => existingScript.removeEventListener('load', initializeGoogleSignIn)
      }
    }
    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.id = scriptId
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initializeGoogleSignIn
    script.onerror = () => notify('Google sign-in could not load. Check your connection and try again.')
    document.head.appendChild(script)
  }, [modal, loginStage, adminEmailInput])
  const submitCashierSignIn = () => {
    const name = loginName.trim()
    if (name.length < 2) return notify('Enter the cashier’s name before continuing.')
    recordSignIn(name, 'Cashier')
  }
  const navItems: { id: View; label: string; icon: typeof ShoppingCart; managerOnly?: boolean }[] = [
    { id: 'pos', label: 'Point of sale', icon: ShoppingCart },
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, managerOnly: true },
    { id: 'orders', label: 'Transactions', icon: FileText },
    { id: 'products', label: 'Menu & products', icon: Coffee, managerOnly: true },
    { id: 'inventory', label: 'Inventory', icon: Archive, managerOnly: true },
    { id: 'customers', label: 'Customers', icon: UserRound, managerOnly: true },
    { id: 'staff', label: 'Staff', icon: Users, managerOnly: true },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'activity', label: 'Activity log', icon: Activity, managerOnly: true },
    { id: 'settings', label: 'Settings', icon: Settings, managerOnly: true },
  ]

  if (!user) return <div className="welcome-page">
    <div className="welcome-grain" />
    <div className="welcome-content"><div className="sparkle sparkle-a">✦</div><div className="sparkle sparkle-b">✧</div>
      <LogoMark />
      <p className="welcome-eyebrow">YOUR NEIGHBORHOOD SIP STOP</p>
      <h1>Good things<br /><em>are brewing.</em></h1>
      <p className="welcome-copy">Made with love, just for you.</p>
      <button className="welcome-button" onClick={() => { setLoginStage('roles'); setModal('login') }}>Get started <ArrowRight size={17} /></button>
      <div className="welcome-contact"><span>[redacted-phone]</span><span>@shotsandsparkles</span></div>
      <div className="welcome-footer">HANDCRAFTED DAILY <i>·</i> SHARED WITH JOY</div>
    </div>
    {modal === 'login' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog role-dialog" onClick={(event) => event.stopPropagation()}>
      <button className="icon-button dialog-close" onClick={() => { setModal(null); setLoginStage('roles') }} aria-label="Close"><X size={18} /></button>
      <LogoMark compact />
      {loginStage === 'roles' && <><h2>Welcome to the counter</h2><p>Choose how you’re signing in.</p>
        <button className="role-choice" onClick={() => setLoginStage('admin')}><ShieldCheck size={20} /><span><b>Admin sign in</b><small>Single authorized Gmail account</small></span><ArrowRight size={16} /></button>
        <button className="role-choice" onClick={() => { setLoginName(''); setLoginStage('cashier') }}><UserRound size={20} /><span><b>Cashier sign in</b><small>Enter your name for the shift log</small></span><ArrowRight size={16} /></button>
      </>}
      {loginStage === 'admin' && <><button className="back-link" onClick={() => setLoginStage('roles')}><ArrowRight size={14} /> Back to roles</button><h2>Admin sign in</h2><p>Use your authorized Gmail and store password.</p>
      <div className="login-form" aria-busy={adminCodeBusy}>
        <label className="form-label admin-email-label">Admin Gmail<input type="email" autoComplete="username" value={adminEmailInput} onChange={(event) => setAdminEmailInput(event.target.value)} placeholder="Enter admin Gmail" /></label>
        <label className="form-label">Password<input type="password" autoComplete="current-password" value={adminPasswordInput} onChange={(event) => setAdminPasswordInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void signInAdminWithPassword() }} placeholder="Enter your store password" /></label>
        <button className="primary-button full-width admin-signin-button" disabled={adminCodeBusy} onClick={() => void signInAdminWithPassword()}>Sign in as Admin <ArrowRight size={17} /></button>
        <small className="admin-signin-note">Use your store password. Do not enter your Google account password.</small>
      </div></>}
      {loginStage === 'cashier' && <><button className="back-link" onClick={() => setLoginStage('roles')}><ArrowRight size={14} /> Back to roles</button><h2>Cashier sign in</h2><p>Your name will be attached to orders and shift activity.</p>
        <label className="form-label">Cashier name<input autoComplete="name" value={loginName} onChange={(event) => setLoginName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitCashierSignIn() }} placeholder="Enter your full name" /></label>
        <button className="primary-button full-width" onClick={submitCashierSignIn}>Continue to POS <ArrowRight size={15} /></button>
      </>}
    </div></div>}
    {notification && <div className="toast">{notification}</div>}
  </div>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><LogoMark compact /><span className="brand-caption">STORE MANAGEMENT</span></div>
      <div className="store-switch"><span className="store-dot" /><span><b>Shots & Sparkles</b><small>San Isidro · Main store</small></span><ChevronDown size={15} /></div>
      <div className="nav-heading">WORKSPACE</div>
      <nav>{navItems.filter((item) => !item.managerOnly || role === 'Manager').map((item) => {
        const Icon = item.icon
        return <button key={item.id} className={`nav-link${view === item.id ? ' active' : ''}`} onClick={() => setView(item.id)} aria-label={item.label} title={item.label}><Icon size={18} /><span>{item.label}</span>{item.id === 'inventory' && lowStock.length > 0 && <b className="nav-count">{lowStock.length}</b>}</button>
      })}</nav>
      <div className="sidebar-bottom"><div className="shift-card"><div><span className="live-dot" /> SHIFT IN PROGRESS</div><strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><small>Started today</small></div>
        <button className="user-card" onClick={() => setModal('login')}><div className="avatar">{user.charAt(0).toUpperCase()}</div><span><b>{user}</b><small>{role}</small></span><ChevronDown size={15} /></button>
        <button className="logout-button" onClick={() => { localStorage.removeItem(authSessionKey); sessionStorage.removeItem('ss-user'); sessionStorage.removeItem('ss-role'); setAuthSession(null); setCart([]) }}><LogOut size={15} /> Sign out</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span>/</span><b>{navItems.find((item) => item.id === view)?.label}</b></div><div className="top-actions"><button className={`sync-indicator ${!isOnline ? 'offline' : !syncEndpoint ? 'device-only' : syncStatus}`} title={syncTitle} onClick={() => setSyncAttempt((attempt) => attempt + 1)} aria-label={syncLabel}>{!isOnline ? <CloudOff size={14} /> : syncStatus === 'syncing' ? <RefreshCw size={14} className="spin" /> : <Cloud size={14} />}<span>{syncLabel}</span></button><div className="today-label"><Clock3 size={15} /> {now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</div><button className="icon-button notification-button" onClick={() => notify(lowStock.length ? `${lowStock.length} low-stock alerts` : 'You are all caught up.')} aria-label="Notifications"><Bell size={18} />{lowStock.length > 0 && <i />}</button><button className="top-avatar" aria-label="Sign out" title={`Sign out ${user}`} onClick={() => { localStorage.removeItem(authSessionKey); sessionStorage.removeItem('ss-user'); sessionStorage.removeItem('ss-role'); setAuthSession(null); setCart([]) }}>{user.charAt(0).toUpperCase()}</button></div></header>
      <div className="page-content">
        {view === 'pos' && <>
          <div className="page-heading"><div><span className="eyebrow">{now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</span><h1>Make something lovely.</h1><p>A little sparkle in every cup.</p></div><div className="order-badge"><span className="live-dot" /> COUNTER OPEN</div></div>
          <div className="pos-layout">
            <section className="menu-panel"><div className="menu-toolbar"><div className="section-title"><h2>Today’s menu</h2><span>{visibleProducts.length} items</span></div><label className="search-field"><Search size={16} /><input placeholder="Find a drink..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label></div>
              <div className="category-tabs"><button className={category === 'all' ? 'selected' : ''} onClick={() => setCategory('all')}>All items</button>{categories.map((item) => <button key={item.id} className={category === item.id ? 'selected' : ''} onClick={() => setCategory(item.id)}>{item.shortLabel}</button>)}</div>
              <div className="product-grid">{visibleProducts.map((item) => <button className={`product-tile color-${item.category}`} key={item.id} onClick={() => startOrder(item)}>
                <div className="tile-art">{item.imageData ? <img className="tile-product-image" src={item.imageData} alt="" /> : <div className="drink-illustration"><span className="drink-lid" /><span className="drink-straw" /><span className="drink-liquid" /><span className="drink-label">S<span>&</span>S</span></div>}<i className="tile-sparkle">✦</i></div>
                <div className="tile-info"><span className="tile-category">{categoriesLabels[item.category]}</span><b>{item.name}</b><span className="tile-price">From {money(Math.min(...item.variants.map((variant) => variant.price)))}</span></div><span className="tile-add"><Plus size={16} /></span>
              </button>)}</div>
              {visibleProducts.length === 0 && <div className="empty-state"><Search size={23} /><b>No drinks found</b><span>Try another search or category.</span></div>}
            </section>
            <aside className="cart-panel"><div className="cart-header"><div><h2>Current order</h2><select className="customer-select" aria-label="Select customer" value={currentCustomerId} onChange={(event) => setCurrentCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.filter((customer) => customer.active).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div className="cart-header-actions"><button className="text-button held-orders-trigger" onClick={() => setModal('held-orders')}>Held <span>{heldOrders.length}</span></button><button className="text-button" onClick={() => setCart([])} disabled={!cart.length}>Clear</button></div></div>
              <div className="order-meta"><span><span className="order-dot" /> NEW ORDER</span><b>#{String(transactions.length + 1).padStart(4, '0')}</b></div>
              <div className="cart-items">{cart.length ? cart.map((item) => <div className="cart-row" key={item.key}><div className="cart-item-art">{item.imageData ? <img src={item.imageData} alt="" /> : <Coffee size={17} />}</div><div className="cart-item-detail"><b>{item.name}</b><span>{item.variant} · {item.sugar} sugar{item.addons.length ? ` · ${item.addons.join(', ')}` : ''}</span><strong>{money(item.price * item.quantity)}</strong></div><div className="quantity-control"><button onClick={() => updateQuantity(item.key, -1)} aria-label="Decrease quantity"><Minus size={12} /></button><b>{item.quantity}</b><button onClick={() => updateQuantity(item.key, 1)} aria-label="Increase quantity"><Plus size={12} /></button></div></div>) : <div className="cart-empty"><div className="empty-bag"><ShoppingBag size={22} /></div><b>Your order is waiting</b><span>Tap a menu favorite to add it here.</span></div>}</div>
              <div className="cart-bottom"><button className="park-order-button" onClick={parkCurrentOrder} disabled={!cart.length}><Pause size={14} /> Park order for later</button><button className="promo-link" onClick={() => setModal('discount')}><Tag size={15} /> Add discount or promo <Plus size={14} /></button>{discount > 0 && <div className="discount-row"><span>Discount applied</span><b>−{money(discount)}</b></div>}<div className="summary-line"><span>Subtotal</span><b>{money(subtotal)}</b></div><div className="summary-line"><span>VAT <small>12%</small></span><b>{money(tax)}</b></div><div className="total-line"><b>Total due</b><strong>{money(total)}</strong></div><button className="checkout-button" onClick={checkout} disabled={!cart.length}><span><CreditCard size={17} /> Charge customer</span><b>{money(total)} <ArrowRight size={16} /></b></button><div className="secure-note"><ShieldCheck size={12} /> Secure checkout · Tax included</div></div>
            </aside>
          </div>
          <div className="pos-footnote"><span><Sparkles size={14} /> Made fresh, made for you</span><span>Need a hand? <button onClick={() => notify('Ask your manager for support.')}>Get help <CircleHelp size={13} /></button></span></div>
        </>}

        {view === 'dashboard' && <>
          <div className="page-heading"><div><span className="eyebrow">STORE AT A GLANCE</span><h1>Good morning, {user.split(' ')[0]}.</h1><p>Here’s how your shop is doing today.</p></div><button className="outline-button" onClick={() => setView('reports')}><ArrowDownToLine size={16} /> Export report</button></div>
          <div className="metric-grid"><Metric label="Today's sales" value={money(todaySales)} change="From completed orders" icon={Wallet} tone="green" /><Metric label="Orders today" value={String(todayTransactions.length).padStart(2, '0')} change="Transactions completed" icon={ShoppingBag} tone="gold" /><Metric label="Average order" value={money(todayTransactions.length ? todaySales / todayTransactions.length : 0)} change="Per transaction" icon={Activity} tone="pink" /><Metric label="Low stock alerts" value={String(lowStock.length).padStart(2, '0')} change={lowStock.length ? 'Items need a restock' : 'All supplies in good shape'} icon={Archive} tone="brown" /></div>
          <div className="dashboard-grid"><section className="content-panel sales-panel"><div className="panel-heading"><div><h2>Sales overview</h2><span>Revenue over the last 7 days</span></div><select defaultValue="7 days"><option>7 days</option><option>30 days</option></select></div><SalesChart transactions={transactions} now={now} /></section><section className="content-panel"><div className="panel-heading"><div><h2>Top picks</h2><span>Most ordered this week</span></div><button className="tiny-link" onClick={() => setView('reports')}>Full report <ArrowRight size={13} /></button></div><TopProducts transactions={transactions} /></section></div>
          <section className="content-panel recent-panel"><div className="panel-heading"><div><h2>Recent orders</h2><span>Your latest activity</span></div><button className="tiny-link" onClick={() => setView('orders')}>View all <ArrowRight size={13} /></button></div><TransactionTable transactions={transactions.slice(0, 5)} onReceipt={setReceipt} /></section>
        </>}

        {view === 'products' && <>
          <section className="menu-management">
            <div className="menu-management-heading"><div><h1>Menu Management</h1><p>Manage products, prices, and availability</p></div><button className="primary-button" onClick={() => setModal('new-product')}><Plus size={16} /> Add Product</button></div>
            <div className="menu-management-tools"><label className="search-field"><Search size={17} /><input placeholder="Search products..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={category} onChange={(event) => setCategory(event.target.value as CategoryId | 'all')}><option value="all">All Categories</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><button className={`archive-filter${productListMode === 'archived' ? ' selected' : ''}`} onClick={() => setProductListMode(productListMode === 'active' ? 'archived' : 'active')}><Archive size={16} />{productListMode === 'active' ? 'Show Archived' : 'Show Active'}</button></div>
            <div className="menu-product-grid">{products.filter((item) => item.archived === (productListMode === 'archived') && (category === 'all' || item.category === category) && item.name.toLowerCase().includes(search.toLowerCase())).map((item) => <MenuProductCard key={item.id} product={item} onEdit={() => setEditProduct(item)} onToggle={() => { setProducts((list) => list.map((entry) => entry.id === item.id ? { ...entry, active: !entry.active } : entry)); addAudit(`Changed availability for ${item.name}`) }} onArchive={() => { setProducts((list) => list.map((entry) => entry.id === item.id ? { ...entry, archived: !entry.archived } : entry)); addAudit(`${item.archived ? 'Restored' : 'Archived'} product ${item.name}`) }} />)}</div>
            {!products.some((item) => item.archived === (productListMode === 'archived') && (category === 'all' || item.category === category) && item.name.toLowerCase().includes(search.toLowerCase())) && <div className="menu-empty"><Coffee size={24} /><b>No products here yet</b><span>Adjust the filters or add a menu item.</span></div>}
          </section>
          <section className="content-panel addon-settings-panel"><div className="panel-heading"><div><h2>POS add-ons</h2><span>Create and manage extras and their prices. Changes appear in product customization.</span></div></div><div className="addon-manager"><div className="addon-editor"><label className="form-label">Add-on name<input value={addOnDraft.name} onChange={(event) => setAddOnDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. Oat milk" /></label><label className="form-label">Price (PHP)<input type="number" min="0" step="0.01" value={addOnDraft.price} onChange={(event) => setAddOnDraft((draft) => ({ ...draft, price: event.target.value }))} /></label><div className="addon-editor-actions"><button className="primary-button" onClick={saveAddOn}>{addOnDraft.id ? 'Save add-on' : 'Add add-on'} <Check size={14} /></button>{addOnDraft.id && <button className="outline-button" onClick={() => setAddOnDraft({ id: null, name: '', price: '10' })}>Cancel</button>}</div></div><div className="addon-list">{addOns.map((item) => <div className="addon-row" key={item.id}><span><b>{item.name}</b><small>{money(item.price)} per item - {item.active ? 'Available' : 'Hidden from POS'}</small></span><div><button className="table-action" onClick={() => setAddOns((items) => items.map((entry) => entry.id === item.id ? { ...entry, active: !entry.active } : entry))}>{item.active ? 'Hide' : 'Show'}</button><button className="table-action" onClick={() => setAddOnDraft({ id: item.id, name: item.name, price: String(item.price) })}>Edit</button><button className="icon-button" aria-label="Delete add-on" onClick={() => deleteAddOn(item)}><Trash2 size={14} /></button></div></div>)}{addOns.length === 0 && <div className="empty-state">No add-ons yet. Add one above to offer it at checkout.</div>}</div></div></section>
          {editProduct && <ProductEditor product={editProduct} onClose={() => setEditProduct(null)} onSave={(next) => { setProducts((list) => list.map((item) => item.id === next.id ? next : item)); addAudit(`Updated product ${next.name}`); setEditProduct(null) }} />}
        </>}

        {view === 'inventory' && <><PageTitle eyebrow="SUPPLIES & INGREDIENTS" title="Inventory" subtitle="Manage stock levels, restocks, and reorder points." action={<button className="primary-button" onClick={() => { setStockEdit(null); setModal('stock') }}><Plus size={16} /> Add stock item</button>} /><div className="metric-grid inventory-metrics"><Metric label="Tracked items" value={String(stock.length).padStart(2, '0')} change="Across ingredients & packaging" icon={Archive} tone="green" /><Metric label="Need attention" value={String(lowStock.length).padStart(2, '0')} change={lowStock.length ? 'Below reorder threshold' : 'No restocks needed'} icon={Bell} tone="gold" /><Metric label="Stock movements" value={String(stockMovements.length).padStart(2, '0')} change="Audit-ready movement history" icon={Activity} tone="pink" /></div><div className="alert-banner"><div className="alert-symbol"><Bell size={17} /></div><div><b>{lowStock.length ? `${lowStock.length} items below the reorder point` : 'Everything is looking stocked'}</b><span>{lowStock.length ? lowStock.map((item) => item.name).join(', ') : 'You have no low-stock alerts at the moment.'}</span></div></div><div className="table-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Search inventory..." value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} /></label><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as 'all' | 'low')}><option value="all">All stock</option><option value="low">Low stock only</option></select></div><section className="content-panel table-panel"><div className="panel-heading"><div><h2>Stock levels</h2><span>Adjust quantities, reorder points, and remove obsolete items.</span></div><span className="muted-tag">{stock.length} tracked</span></div><InventoryTable stock={stock.filter((item) => item.name.toLowerCase().includes(stockSearch.toLowerCase()) && (stockFilter === 'all' || item.quantity <= item.low))} onEdit={(item) => { setStockEdit(item); setModal('stock') }} onDelete={(item) => { setStock((items) => items.filter((entry) => entry.id !== item.id)); appendStockMovement({ ...item, quantity: 0 }, -item.quantity, 'Deleted'); addAudit(`Removed inventory item ${item.name}`) }} /></section><section className="content-panel audit-panel"><div className="panel-heading"><div><h2>Stock movement history</h2><span>Restocks, adjustments, sales deductions, and removals.</span></div></div><StockMovementTable movements={stockMovements} /></section></>}

        {view === 'customers' && <><PageTitle eyebrow="CUSTOMER BOOK" title="Customers" subtitle="Manage customer details and view each customer’s sales history." action={<button className="primary-button" onClick={() => { setCustomerEdit(null); setModal('customer') }}><Plus size={16} /> Add customer</button>} /><div className="metric-grid"><Metric label="Customer records" value={String(customers.filter((customer) => customer.active).length).padStart(2, '0')} change="Active customer profiles" icon={Users} tone="green" /><Metric label="Linked sales" value={String(transactions.filter((transaction) => transaction.customerId).length).padStart(2, '0')} change="Sales assigned to a customer" icon={ShoppingBag} tone="gold" /></div><div className="table-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Search name, phone, or email..." value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} /></label></div><section className="content-panel table-panel"><CustomerTable customers={customers.filter((customer) => customer.active && `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(customerSearch.toLowerCase()))} sales={transactions} onEdit={(customer) => { setCustomerEdit(customer); setModal('customer') }} onArchive={(customer) => { setCustomers((items) => items.map((item) => item.id === customer.id ? { ...item, active: false } : item)); addAudit(`Archived customer ${customer.name}`) }} onSales={(customer) => { setOrdersCustomerFilter(customer.id); setSearch(''); setView('orders') }} /></section><section className="content-panel audit-panel"><div className="panel-heading"><div><h2>Archived customer records</h2><span>Archived profiles stay attached to their past sales.</span></div></div><CustomerTable customers={customers.filter((customer) => !customer.active)} sales={transactions} onEdit={(customer) => { setCustomerEdit(customer); setModal('customer') }} onArchive={(customer) => setCustomers((items) => items.map((item) => item.id === customer.id ? { ...item, active: true } : item))} onSales={(customer) => { setOrdersCustomerFilter(customer.id); setView('orders') }} archiveLabel="Restore" /></section></>}

        {view === 'orders' && <><PageTitle eyebrow="SALES REGISTER" title="Sales & receipts" subtitle="Customer sales are kept separate from staff and inventory activity." /><div className="metric-grid"><Metric label="Today's sales" value={money(visibleTodayTransactions.reduce((sum, item) => sum + item.total, 0))} change={`${visibleTodayTransactions.length} orders today`} icon={Wallet} tone="green" /><Metric label={role === 'Manager' ? 'All transactions' : 'Your transactions'} value={String(visibleTransactions.length).padStart(2, '0')} change="Saved on this device" icon={FileText} tone="gold" /></div><section className="content-panel table-panel transactions-page"><div className="panel-heading"><div><h2>{ordersCustomerFilter ? `Sales for ${customers.find((customer) => customer.id === ordersCustomerFilter)?.name || 'customer'}` : role === 'Manager' ? 'Sales transactions' : 'Your transactions'}</h2><span>Reprint receipts or review a sale.</span></div><div className="table-toolbar">{ordersCustomerFilter && <button className="table-action" onClick={() => setOrdersCustomerFilter('')}>All sales</button>}<label className="search-field"><Search size={16} /><input placeholder="Search receipt or customer..." value={search} onChange={(event) => setSearch(event.target.value)} /></label></div></div><TransactionTable transactions={visibleTransactions.filter((item) => (!ordersCustomerFilter || item.customerId === ordersCustomerFilter) && `${item.id} ${item.customerName || ''}`.toLowerCase().includes(search.toLowerCase()))} onReceipt={setReceipt} /></section></>}

        {view === 'staff' && <><PageTitle eyebrow="YOUR LITTLE DREAM TEAM" title="Staff" subtitle="People make the place. Manage your team here." action={<button className="primary-button" onClick={() => setModal('staff')}><Plus size={16} /> Add team member</button>} /><div className="metric-grid"><Metric label="Team members" value={String(staff.length).padStart(2, '0')} change="Across all roles" icon={Users} tone="green" /><Metric label="On shift" value={String(staff.filter((item) => item.status === 'Active').length).padStart(2, '0')} change="Currently active" icon={Activity} tone="gold" /></div><section className="content-panel table-panel"><div className="panel-heading"><div><h2>Your team</h2><span>Roles and account status</span></div></div><div className="table-scroll"><table><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>STATUS</th><th>ACCESS</th><th></th></tr></thead><tbody>{staff.map((member, index) => <tr key={`${member.name}-${index}`}><td><span className="person-cell"><span className="person-avatar">{member.name.charAt(0)}</span><b>{member.name}</b></span></td><td>{member.role}</td><td><span className="status-pill in-stock">{member.status}</span></td><td><span className="role-access">{member.role === 'Manager' ? 'Full access' : 'POS & reports'}</span></td><td><button className="icon-button row-action" aria-label={`Remove ${member.name}`} onClick={() => { setStaff((items) => items.filter((_, i) => i !== index)); addAudit(`Removed staff member ${member.name}`) }}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div></section><div className="note-banner"><ShieldCheck size={16} /><span>Staff accounts in this demo are local only. Connect an authentication provider before using this app in a live store.</span></div></>}

        {view === 'activity' && <><PageTitle eyebrow="SEPARATE OPERATIONAL HISTORY" title="Activity log" subtitle="Staff actions and inventory movements are separate from customer sales." /><div className="dashboard-grid"><section className="content-panel"><div className="panel-heading"><div><h2>Audit log</h2><span>Recent changes made in this store.</span></div></div><AuditList audit={audit} /></section><section className="content-panel"><div className="panel-heading"><div><h2>Inventory movements</h2><span>Stock changes and sale deductions.</span></div></div><StockMovementTable movements={stockMovements.slice(0, 12)} /></section></div><section className="content-panel table-panel recent-panel"><div className="panel-heading"><div><h2>Sales stay separate</h2><span>Customer purchases and receipts are maintained in the sales register.</span></div><button className="tiny-link" onClick={() => setView('orders')}>Open sales <ArrowRight size={13} /></button></div></section></>}

        {view === 'reports' && <><PageTitle eyebrow="NUMBERS WITH A LITTLE SPARKLE" title={role === 'Manager' ? 'Reports' : 'Shift closeout'} subtitle={role === 'Manager' ? 'A clearer look at how your shop is doing.' : 'Your completed sales for this shift.'} action={<button className="outline-button" onClick={printReport}><Printer size={16} /> Print report</button>} /><div className="report-filter">{(["daily", "weekly", "monthly", "custom"] as const).filter((range) => role === "Manager" || range === "daily" || range === "custom").map((range) => <button className={`filter-chip${reportRange === range ? " selected" : ""}`} key={range} onClick={() => setReportRange(range)}>{range === "custom" ? "Custom dates" : range.charAt(0).toUpperCase() + range.slice(1)}</button>)}{reportRange === "custom" && <div className="report-date-range"><label>From<input type="date" value={reportFrom} max={reportTo} onChange={(event) => setReportFrom(event.target.value)} /></label><label>To<input type="date" value={reportTo} min={reportFrom} onChange={(event) => setReportTo(event.target.value)} /></label></div>}<span>{periodTransactions.length} {periodTransactions.length === 1 ? "record" : "records"}</span></div><div className="metric-grid"><Metric label={role === 'Manager' ? 'Gross sales' : 'Your cash out'} value={money(periodSales)} change={`${reportRange} · before discounts`} icon={Wallet} tone="green" />{role === 'Manager' && <Metric label="Discounts given" value={money(periodTransactions.reduce((sum, item) => sum + item.discount, 0))} change={`Across ${reportPeriodLabel}`} icon={Tag} tone="gold" />}<Metric label="Completed orders" value={String(periodTransactions.length)} change={reportRange === "custom" ? `Across ${reportPeriodLabel}` : `Across ${reportRange} period`} icon={ShoppingBag} tone="pink" /><Metric label="Avg. order value" value={money(periodTransactions.length ? periodSales / periodTransactions.length : 0)} change={reportRange === "custom" ? `Across ${reportPeriodLabel}` : `Across ${reportRange} period`} icon={BarChart3} tone="brown" /></div>{role === 'Manager' ? <><section className="content-panel sales-panel report-chart"><div className="panel-heading"><div><h2>Revenue trend</h2><span>Sales across the selected dates</span></div></div><SalesChart transactions={periodTransactions} start={selectedPeriodStart} end={selectedPeriodEnd} /></section><div className="report-chart-grid"><CategorySalesChart transactions={periodTransactions} /><PaymentMixChart transactions={periodTransactions} /><HourlyOrdersChart transactions={periodTransactions} /><section className="content-panel report-graph-panel"><div className="panel-heading"><div><h2>Product performance</h2><span>Best-selling drinks in this period</span></div></div><TopProducts transactions={periodTransactions} /></section></div></> : <section className="content-panel table-panel"><div className="panel-heading"><div><h2>Your completed sales</h2><span>Transactions linked to your cashier account.</span></div></div><TransactionTable transactions={periodTransactions} onReceipt={setReceipt} /></section>}</>}

        {view === 'settings' && <><PageTitle eyebrow="THE LITTLE DETAILS" title="Store settings" subtitle="Make this space feel like your shop." /><section className="content-panel settings-panel"><div className="settings-section"><div><h2>Store profile</h2><span>What customers see on their receipt.</span></div><div className="settings-fields"><label>Store name<input defaultValue="Shots & Sparkles" /></label><label>Social handle<input defaultValue="@shotsandsparkles" /></label><label>Contact number<input defaultValue="[redacted-phone]" /></label><button className="primary-button" onClick={() => notify('Store profile saved.')}>Save changes <Check size={15} /></button></div></div><div className="settings-section"><div><h2>Sales & tax</h2><span>Tax is calculated on each order.</span></div><div className="setting-toggle"><span><b>VAT</b><small>12% tax applied at checkout.</small></span><span className="toggle enabled">ON</span></div></div><div className="settings-section"><div><h2>Session security</h2><span>Automatic sign-out for inactive sessions.</span></div><div className="setting-toggle"><span><b>Session timeout</b><small>Signs out after 5 minutes without activity, even if you close the app.</small></span><span className="toggle enabled">5 MIN</span></div></div><div className="note-banner"><ShieldCheck size={16} /><span>This client-only demo stores records in this browser. For real authentication, staff controls, and secure backups, connect a server before opening your store.</span></div></section></>}
      </div>
    </main>

    {modal === 'product' && selected && <div className="overlay" onClick={() => setModal(null)}><div className="dialog customize-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className={`customize-art color-${selected.category}`}><div className="drink-illustration"><span className="drink-lid" /><span className="drink-straw" /><span className="drink-liquid" /><span className="drink-label">S<span>&</span>S</span></div></span><div className="customize-heading"><span className="eyebrow">{categoriesLabels[selected.category]}</span><h2>{selected.name}</h2><p>Make it just the way you like it.</p></div><div className="option-block"><div className="option-title"><b>Choose your size</b><span>Required</span></div><div className="variant-options">{selected.variants.map((variant, index) => <button className={variantIndex === index ? 'picked' : ''} key={variant.name} onClick={() => setVariantIndex(index)}><span>{variant.name}</span><b>{money(variant.price + selectedAddOnTotal)}</b></button>)}</div></div>{selected.category !== 'dessert' && <><div className="option-block"><div className="option-title"><b>Sugar level</b><span>{sugar}</span></div><div className="sugar-options">{['0%', '25%', '50%', '75%', '100%'].map((level) => <button className={sugar === level ? 'picked' : ''} key={level} onClick={() => setSugar(level)}>{level}</button>)}</div></div><div className="option-block"><div className="option-title"><b>A little extra</b><span>Optional</span></div><div className="addon-options">{addOns.filter((item) => item.active).map((addon) => <button className={addons.includes(addon.name) ? 'picked' : ''} key={addon.id} onClick={() => setAddons((items) => items.includes(addon.name) ? items.filter((item) => item !== addon.name) : [...items, addon.name])}><span className="checkbox">{addons.includes(addon.name) && <Check size={12} />}</span>{addon.name} <b>+{money(addon.price)}</b></button>)}</div></div></>}<button className="checkout-button add-button" onClick={addToCart}><span><Plus size={17} /> Add to order</span><b>{money(selected.variants[variantIndex].price + selectedAddOnTotal)}</b></button></div></div>}

    {modal === 'held-orders' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog held-orders-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">READY WHEN YOU ARE</span><h2>Parked orders</h2><p className="dialog-description">Save a spot in the queue, then pick up right where you left off.</p>{heldOrders.length ? <div className="held-order-list">{heldOrders.map((order) => <div className="held-order-card" key={order.id}><div className="held-order-info"><b>{order.label}</b><span>{order.items.reduce((quantity, item) => quantity + item.quantity, 0)} items · {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{order.customerId ? ` · ${customers.find((customer) => customer.id === order.customerId)?.name || 'Customer'}` : ''}</span><strong>{money(Math.max(0, order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 1.12 - order.discount))}</strong></div><button className="primary-button" onClick={() => resumeHeldOrder(order)}>Resume <ArrowRight size={14} /></button></div>)}</div> : <div className="held-orders-empty"><Pause size={22} /><b>No parked orders yet</b><span>Park an order if a customer needs a little more time.</span></div>}</div></div>}

    {modal === 'payment' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog payment-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">ALMOST THERE</span><h2>Take payment</h2><p className="dialog-description">A lovely order, coming right up.</p><div className="payment-total"><span>Total due</span><b>{money(total)}</b></div><div className="payment-methods">{(['Cash', 'GCash'] as const).map((method) => <button className={payment === method ? 'selected' : ''} onClick={() => setPayment(method)} key={method}>{method === 'Cash' ? <BanknoteIcon /> : <Wallet size={17} />}{method}</button>)}</div>{payment === 'Cash' ? <><label className="form-label">Cash received<input type="number" min={total} placeholder="Enter amount in ₱" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} /></label><div className="change-line"><span>Change</span><b>{money(Math.max(0, Number(cashReceived || 0) - total))}</b></div><div className="quick-cash">{[Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter((amount, index, list) => list.indexOf(amount) === index).map((amount) => <button key={amount} onClick={() => setCashReceived(String(amount))}>{money(amount)}</button>)}</div></> : <div className="gcash-payment"><QRCodeSVG className="gcash-qr-code" value={gcashNumber} size={240} level="H" includeMargin /></div>}<button className="checkout-button complete-button" onClick={completeSale}><span><Check size={17} /> Complete sale</span><b>{money(total)}</b></button></div></div>}

    {modal === 'discount' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">A LITTLE SOMETHING EXTRA</span><h2>Apply a discount</h2><p className="dialog-description">Senior and PWD discounts, promo codes, or a custom amount.</p><div className="discount-presets"><button onClick={() => { setDiscount(Math.round(subtotal * 0.2 * 100) / 100); setModal(null) }}>Senior / PWD · 20%<ArrowRight size={15} /></button></div><label className="form-label">Custom discount in PHP<input type="number" min="0" max={subtotal} value={customDiscount} onChange={(event) => setCustomDiscount(event.target.value)} placeholder="Enter amount" /></label><button className="outline-button full-width" onClick={() => { const amount = Number(customDiscount); if (amount > 0) { setDiscount(Math.min(amount, subtotal)); setCustomDiscount(''); setModal(null) } else notify('Enter a valid discount amount.') }}>Apply custom amount</button><label className="form-label">Promo code<input placeholder="e.g. SPARKLE10" value={promo} onChange={(event) => setPromo(event.target.value.toUpperCase())} /></label><button className="primary-button full-width" onClick={() => { if (promo === 'SPARKLE10') { setDiscount(Math.round(subtotal * 0.1 * 100) / 100); setModal(null) } else notify('That promo code is not valid.') }}>Apply promo</button></div></div>}

    {modal === 'new-product' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">MENU EDITOR</span><h2>Add product</h2><p className="dialog-description">Add a new item to your menu.</p><label className="form-label">Product name<input value={newProductName} onChange={(event) => setNewProductName(event.target.value)} placeholder="e.g. Brown Sugar Latte" /></label><label className="form-label">Category<select value={newProductCategory} onChange={(event) => setNewProductCategory(event.target.value as CategoryId)}>{categories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="form-label">Price in PHP<input type="number" min="1" value={newProductPrice} onChange={(event) => setNewProductPrice(event.target.value)} /></label><ImagePicker value={newProductImage} onChange={setNewProductImage} /><button className="primary-button full-width" onClick={createProduct}>Add product <Plus size={15} /></button></div></div>}

    {modal === 'staff' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">GROWING THE TEAM</span><h2>Add team member</h2><p className="dialog-description">Assign a store role to this team member.</p><label className="form-label">Full name<input placeholder="e.g. Jamie Cruz" value={newStaffName} onChange={(event) => setNewStaffName(event.target.value)} /></label><label className="form-label">Role<select value={newStaffRole} onChange={(event) => setNewStaffRole(event.target.value as Role)}><option>Cashier</option><option>Manager</option></select></label><button className="primary-button full-width" onClick={addTeamMember}>Add team member <Plus size={15} /></button></div></div>}

    {modal === 'stock' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">{stockEdit ? 'STOCK ADJUSTMENT' : 'NEW SUPPLY'}</span><h2>{stockEdit ? 'Update stock' : 'Add stock item'}</h2><StockForm item={stockEdit} onSave={(item) => { const oldItem = stockEdit ? stock.find((entry) => entry.id === item.id) : undefined; setStock((items) => stockEdit ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item]); appendStockMovement(item, item.quantity - (oldItem?.quantity || 0), stockEdit ? 'Adjustment' : 'Restock'); addAudit(`${stockEdit ? 'Updated stock for' : 'Added stock item'} ${item.name}`); setModal(null) }} /></div></div>}

    {modal === 'customer' && <CustomerForm customer={customerEdit} onClose={() => { setCustomerEdit(null); setModal(null) }} onSave={saveCustomer} />}

    {receipt && <div className="overlay receipt-overlay" onClick={() => setReceipt(null)}><div className="dialog receipt-dialog" onClick={(event) => event.stopPropagation()}><div className="receipt-actions"><button className="icon-button" aria-label="Close receipt" onClick={() => setReceipt(null)}><X size={18} /></button></div><div className="receipt-paper"><LogoMark compact /><span className="receipt-caption">SAN ISIDRO · MAIN STORE</span><div className="receipt-divider" /><div className="receipt-id"><span>RECEIPT</span><b>{receipt.id}</b></div><div className="receipt-meta"><span>{new Date(receipt.date).toLocaleString()}</span><span>Cashier: {receipt.cashier}</span>{receipt.customerName && <span>Customer: {receipt.customerName}</span>}</div><div className="receipt-divider" />{receipt.items.map((item, index) => <div className="receipt-item" key={`${item.key}-${index}`}><div><b>{item.name}</b><span>{item.quantity} × {item.variant}{item.category !== 'dessert' ? ` · ${item.sugar} sugar` : ''}{item.addons.length ? ` · ${item.addons.join(', ')}` : ''}</span></div><strong>{money(item.price * item.quantity)}</strong></div>)}<div className="receipt-divider" /><div className="receipt-breakdown"><span>Subtotal <b>{money(receipt.items.reduce((sum, item) => sum + item.price * item.quantity, 0))}</b></span><span>VAT 12% <b>{money(Math.round(receipt.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 0.12 * 100) / 100)}</b></span>{receipt.discount > 0 && <span>Discount <b>−{money(receipt.discount)}</b></span>}</div><div className="receipt-total"><span>Total</span><b>{money(receipt.total)}</b></div><div className="receipt-meta"><span>Payment · {receipt.method}</span>{receipt.reference && <span>Reference · {receipt.reference}</span>}</div><div className="receipt-thanks">MADE WITH LOVE, JUST FOR YOU <Sparkles size={13} /></div></div><button className="primary-button receipt-print" onClick={printReceipt}><Printer size={16} /> Print receipt</button></div></div>}
    {notification && <div className="toast"><Check size={15} /> {notification}</div>}
  </div>
}

function BanknoteIcon() { return <Wallet size={17} /> }
function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div> }
function Metric({ label, value, change, icon: Icon, tone }: { label: string; value: string; change: string; icon: typeof Wallet; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{change}</small></div> }
function SalesChart({ transactions, start, end, now }: { transactions: Transaction[]; start?: Date; end?: Date; now?: Date }) {
  const chartEnd = end || now || new Date()
  const chartStart = start || new Date(chartEnd.getTime() - 6 * 86_400_000)
  const dayCount = Math.max(1, Math.ceil((chartEnd.getTime() - chartStart.getTime()) / 86_400_000) + 1)
  const bucketCount = Math.min(dayCount, 14)
  const span = Math.max(chartEnd.getTime() - chartStart.getTime() + 1, 1)
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({ value: 0, from: new Date(chartStart.getTime() + span * index / bucketCount), to: new Date(chartStart.getTime() + span * (index + 1) / bucketCount - 1) }))
  transactions.forEach((transaction) => {
    const ratio = (new Date(transaction.date).getTime() - chartStart.getTime()) / span
    const index = Math.max(0, Math.min(bucketCount - 1, Math.floor(ratio * bucketCount)))
    if (Number.isFinite(ratio)) buckets[index].value += transaction.total
  })
  const max = Math.max(...buckets.map((bucket) => bucket.value), 500)
  const label = (date: Date) => date.toLocaleDateString('en', { month: 'numeric', day: 'numeric' })
  return <div className="sales-chart"><div className="chart-guides"><span>₱{Math.ceil(max / 100) * 100}</span><span>₱{Math.ceil(max / 200) * 100}</span><span>₱0</span></div><div className="chart-columns" style={{ gridTemplateColumns: `repeat(${bucketCount}, minmax(0, 1fr))` }}>{buckets.map((bucket, index) => <div className="chart-column" key={`${bucket.from.toISOString()}-${index}`}><div className="bar-track"><div className={`chart-bar${index === bucketCount - 1 ? ' today' : ''}`} style={{ height: `${Math.max(bucket.value ? bucket.value / max * 100 : 3, 3)}%` }} title={`${label(bucket.from)}${bucketCount > 1 ? `–${label(bucket.to)}` : ''}: ${money(bucket.value)}`} /></div><span>{label(bucket.from)}</span></div>)}</div></div>
}
function CategorySalesChart({ transactions }: { transactions: Transaction[] }) {
  const totals = new Map<CategoryId, number>(categories.map((category) => [category.id, 0]))
  transactions.forEach((transaction) => transaction.items.forEach((item) => {
    totals.set(item.category, (totals.get(item.category) || 0) + item.price * item.quantity)
  }))
  const rows = categories.map((category) => ({ ...category, total: totals.get(category.id) || 0 }))
  const maximum = Math.max(...rows.map((row) => row.total), 1)
  return <section className="content-panel report-graph-panel"><div className="panel-heading"><div><h2>Sales by category</h2><span>Item sales before tax and discounts</span></div></div>{transactions.length ? <div className="category-sales-chart">{rows.map((row) => <div className="category-sales-row" key={row.id}><span>{row.shortLabel}</span><div className="category-sales-track"><i className={`category-sales-bar category-${row.id}`} style={{ width: `${row.total / maximum * 100}%` }} /></div><b>{money(row.total)}</b></div>)}</div> : <ChartEmpty message="Category sales will appear when orders are recorded." />}</section>
}
function PaymentMixChart({ transactions }: { transactions: Transaction[] }) {
  const totals = new Map<string, { count: number; amount: number }>()
  transactions.forEach((transaction) => {
    const current = totals.get(transaction.method) || { count: 0, amount: 0 }
    totals.set(transaction.method, { count: current.count + 1, amount: current.amount + transaction.total })
  })
  const methods = [...totals.entries()].sort((first, second) => second[1].amount - first[1].amount)
  const total = transactions.reduce((sum, transaction) => sum + transaction.total, 0)
  const gradient = methods.reduce<{ offset: number; stops: string[] }>((result, [, value], index) => {
    const end = result.offset + value.amount / Math.max(total, 1) * 100
    return {
      offset: end,
      stops: [...result.stops, `${index % 2 === 0 ? '#397552' : '#d3b36c'} ${result.offset}% ${end}%`],
    }
  }, { offset: 0, stops: [] }).stops.join(', ')
  return <section className="content-panel report-graph-panel"><div className="panel-heading"><div><h2>Payment methods</h2><span>Share of sales by tender</span></div></div>{transactions.length ? <div className="payment-mix-content"><div className="payment-donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={`Payment mix totaling ${money(total)}`}><div><b>{money(total)}</b><span>Total sales</span></div></div><div className="payment-legend">{methods.map(([method, value], index) => <div className="payment-legend-row" key={method}><i className={index % 2 === 0 ? 'legend-cash' : 'legend-gcash'} /><span><b>{method}</b><small>{value.count} {value.count === 1 ? 'order' : 'orders'}</small></span><strong>{money(value.amount)}</strong></div>)}</div></div> : <ChartEmpty message="Payment mix will appear when orders are recorded." />}</section>
}
function HourlyOrdersChart({ transactions }: { transactions: Transaction[] }) {
  const buckets = Array.from({ length: 12 }, (_, index) => ({ start: index * 2, count: 0 }))
  transactions.forEach((transaction) => {
    const hour = new Date(transaction.date).getHours()
    buckets[Math.floor(hour / 2)].count += 1
  })
  const maximum = Math.max(...buckets.map((bucket) => bucket.count), 1)
  const peak = buckets.reduce((best, bucket) => bucket.count > best.count ? bucket : best, buckets[0])
  const peakLabel = `${String(peak.start % 12 || 12)}${peak.start < 12 ? 'a' : 'p'}`
  return <section className="content-panel report-graph-panel hourly-orders-panel"><div className="panel-heading"><div><h2>Orders by time</h2><span>Order volume by two-hour window</span></div>{transactions.length > 0 && <div className="hourly-peak"><span>BUSIEST WINDOW</span><b>{peakLabel} · {peak.count} {peak.count === 1 ? 'order' : 'orders'}</b></div>}</div>{transactions.length ? <div className="hourly-orders-chart" role="img" aria-label={`Orders by two-hour window. Busiest period is ${peakLabel} with ${peak.count} orders.`}>{buckets.map((bucket) => { const label = `${String(bucket.start % 12 || 12)}${bucket.start < 12 ? 'a' : 'p'}`; return <div className={`hourly-order-column${bucket.start === peak.start ? ' peak' : ''}`} key={bucket.start} title={`${label}: ${bucket.count} ${bucket.count === 1 ? 'order' : 'orders'}`}><b>{bucket.count}</b><div className="hourly-order-track"><i style={{ height: `${bucket.count ? Math.max(bucket.count / maximum * 100, 5) : 0}%` }} /></div><span>{label}</span></div> })}</div> : <ChartEmpty message="Order activity will appear when sales are recorded." />}</section>
}
function ChartEmpty({ message }: { message: string }) { return <div className="report-chart-empty"><BarChart3 size={22} /><span>{message}</span></div> }
function TopProducts({ transactions }: { transactions: Transaction[] }) {
  const counts = new Map<string, { quantity: number; name: string; category: CategoryId }>()
  transactions.forEach((transaction) => transaction.items.forEach((item) => { const current = counts.get(item.productId); counts.set(item.productId, { name: item.name, category: item.category, quantity: (current?.quantity || 0) + item.quantity }) }))
  const top = [...counts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5)
  return top.length ? <div className="top-products">{top.map((item, index) => <div className="top-product" key={item.name}><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><span className={`top-product-icon color-${item.category}`}><Coffee size={16} /></span><span><b>{item.name}</b><small>{categoriesLabels[item.category]}</small></span><strong>{item.quantity} sold</strong></div>)}</div> : <div className="empty-table"><ShoppingBag size={20} /><span>Completed orders will show your top picks.</span></div>
}
function TransactionTable({ transactions, onReceipt }: { transactions: Transaction[]; onReceipt: (transaction: Transaction) => void }) { return <div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>DATE & TIME</th><th>CUSTOMER</th><th>CASHIER</th><th>ITEMS</th><th>PAYMENT</th><th>TOTAL</th><th></th></tr></thead><tbody>{transactions.length ? transactions.map((transaction) => <tr key={transaction.id}><td><b className="receipt-cell">{transaction.id}</b></td><td>{new Date(transaction.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{transaction.customerName || 'Walk-in'}</td><td>{transaction.cashier}</td><td>{transaction.items.reduce((sum, item) => sum + item.quantity, 0)} items</td><td><span className="payment-pill">{transaction.method}</span></td><td><b>{money(transaction.total)}</b></td><td><button className="icon-button row-action" onClick={() => onReceipt(transaction)} aria-label={`Reprint ${transaction.id}`}><Printer size={15} /></button></td></tr>) : <tr><td colSpan={8}><div className="empty-table"><FileText size={20} /><span>No sales recorded in this view yet.</span></div></td></tr>}</tbody></table></div> }
function MenuProductCard({ product, onEdit, onToggle, onArchive }: { product: Product; onEdit: () => void; onToggle: () => void; onArchive: () => void }) {
  const startingPrice = Math.min(...product.variants.map((variant) => variant.price))
  return <article className="menu-product-card">
    <div className="menu-card-head">
      <div className={`menu-card-art color-${product.category}`}>
        {product.imageData ? <img src={product.imageData} alt={product.name} /> : <div className="menu-placeholder"><Coffee size={28} /></div>}
        <button className="menu-image-edit" aria-label={`${product.imageData ? 'Change' : 'Add'} image for ${product.name}`} title="Edit this product image" onClick={onEdit}><ImagePlus size={15} /></button>
      </div>
      <div className="menu-card-info"><span className={`menu-category-tag tag-${product.category}`}>{categoriesLabels[product.category]}</span><h2>{product.name}</h2><p className="menu-card-series">{categories.find((item) => item.id === product.category)?.label.replace(' Series', '')}</p><button className={`status-pill menu-stock-pill ${product.active ? 'in-stock' : 'out-stock'}`} onClick={onToggle}>{product.active ? 'In Stock' : 'Out of Stock'}</button></div>
    </div>
    <div className="menu-size-chips">{product.variants.map((variant) => <span key={variant.name}><b>{variant.name}:</b> {money(variant.price)}</span>)}</div>
    <div className="menu-card-footer"><span>from {money(startingPrice)}</span><div><button className="icon-button" aria-label={`Edit ${product.name}`} title="Edit product" onClick={onEdit}><Pencil size={16} /></button><button className="icon-button archive-product" aria-label={`${product.archived ? 'Restore' : 'Archive'} ${product.name}`} title={product.archived ? 'Restore product' : 'Archive product'} onClick={onArchive}>{product.archived ? <RefreshCw size={16} /> : <Archive size={16} />}</button></div></div>
  </article>
}
function InventoryTable({ stock, onEdit, onDelete }: { stock: StockItem[]; onEdit: (item: StockItem) => void; onDelete: (item: StockItem) => void }) { return <div className="table-scroll"><table><thead><tr><th>ITEM</th><th>ON HAND</th><th>REORDER POINT</th><th>STATUS</th><th></th></tr></thead><tbody>{stock.map((item) => { const low = item.quantity <= item.low; return <tr key={item.id}><td><b>{item.name}</b></td><td><strong>{item.quantity}</strong> {item.unit}</td><td>{item.low} {item.unit}</td><td><span className={`status-pill ${low ? 'out-stock' : 'in-stock'}`}>{low ? 'Restock soon' : 'In stock'}</span></td><td><button className="table-action" onClick={() => onEdit(item)}>Adjust stock</button><button className="icon-button row-action" aria-label={`Remove ${item.name}`} onClick={() => onDelete(item)}><Trash2 size={15} /></button></td></tr> })}</tbody></table></div> }
function StockMovementTable({ movements }: { movements: StockMovement[] }) { return <div className="table-scroll"><table><thead><tr><th>TIME</th><th>ITEM</th><th>ACTION</th><th>CHANGE</th><th>BALANCE</th><th>BY</th></tr></thead><tbody>{movements.length ? movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td><td><b>{movement.itemName}</b></td><td>{movement.action}</td><td className={movement.change < 0 ? 'movement-negative' : 'movement-positive'}>{movement.change > 0 ? '+' : ''}{movement.change}</td><td>{movement.balance}</td><td>{movement.actor}</td></tr>) : <tr><td colSpan={6}><div className="empty-table"><Archive size={20} /><span>No inventory changes recorded yet.</span></div></td></tr>}</tbody></table></div> }
function CustomerTable({ customers, sales, onEdit, onArchive, onSales, archiveLabel = 'Archive' }: { customers: Customer[]; sales: Transaction[]; onEdit: (customer: Customer) => void; onArchive: (customer: Customer) => void; onSales: (customer: Customer) => void; archiveLabel?: string }) { return <div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>EMAIL</th><th>ORDERS</th><th>LIFETIME SALES</th><th>ACTIONS</th></tr></thead><tbody>{customers.length ? customers.map((customer) => { const customerTransactions = sales.filter((transaction) => transaction.customerId === customer.id); return <tr key={customer.id}><td><span className="person-cell"><span className="person-avatar">{customer.name.charAt(0).toUpperCase()}</span><b>{customer.name}</b></span></td><td>{customer.phone || '—'}</td><td>{customer.email || '—'}</td><td>{customerTransactions.length}</td><td><b>{money(customerTransactions.reduce((sum, transaction) => sum + transaction.total, 0))}</b></td><td><button className="table-action" onClick={() => onSales(customer)}>Sales history</button><button className="table-action" onClick={() => onEdit(customer)}>Edit</button><button className="table-action" onClick={() => onArchive(customer)}>{archiveLabel}</button></td></tr> }) : <tr><td colSpan={6}><div className="empty-table"><Users size={20} /><span>No customer records in this list.</span></div></td></tr>}</tbody></table></div> }
function AuditList({ audit }: { audit: string[] }) { return <div className="audit-list">{audit.length ? audit.slice(0, 8).map((entry, index) => <div key={`${entry}-${index}`}><span className="audit-dot" /><span>{entry}</span></div>) : <div className="empty-table"><Activity size={18} /><span>No recent store activity.</span></div>}</div> }
function ProductEditor({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (item: Product) => void }) { const [name, setName] = useState(product.name); const [imageData, setImageData] = useState(product.imageData || ''); const [prices, setPrices] = useState(product.variants.map((variant) => String(variant.price))); return <div className="overlay" onClick={onClose}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="eyebrow">MENU EDITOR</span><h2>Edit product</h2><label className="form-label">Product name<input value={name} onChange={(event) => setName(event.target.value)} /></label><ImagePicker value={imageData} onChange={setImageData} />{product.variants.map((variant, index) => <label className="form-label" key={variant.name}>{variant.name} price<input type="number" min="1" value={prices[index]} onChange={(event) => setPrices((items) => items.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /></label>)}<button className="primary-button full-width" onClick={() => onSave({ ...product, name: name.trim() || product.name, imageData: imageData || undefined, variants: product.variants.map((variant, index) => ({ ...variant, price: Number(prices[index]) || variant.price })) })}>Save product <Check size={15} /></button></div></div> }
function CustomerForm({ customer, onClose, onSave }: { customer: Customer | null; onClose: () => void; onSave: (customer: Customer) => void }) { const [name, setName] = useState(customer?.name || ''); const [phone, setPhone] = useState(customer?.phone || ''); const [email, setEmail] = useState(customer?.email || ''); const [notes, setNotes] = useState(customer?.notes || ''); return <div className="overlay" onClick={onClose}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="eyebrow">CUSTOMER RECORD</span><h2>{customer ? 'Edit customer' : 'Add customer'}</h2><label className="form-label">Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer name" /></label><label className="form-label">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" /></label><label className="form-label">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" /></label><label className="form-label">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" /></label><button className="primary-button full-width" onClick={() => { if (!name.trim()) return; onSave({ id: customer?.id || `customer-${Date.now()}`, name: name.trim(), phone: phone.trim(), email: email.trim(), notes: notes.trim(), active: customer?.active ?? true }) }}>{customer ? 'Save customer' : 'Create customer'} <Check size={15} /></button></div></div> }
function ImagePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState('')
  const handleFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file.')
    if (file.size > 8 * 1024 * 1024) return setError('Choose an image under 8 MB.')
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return setError('Image processing is unavailable in this browser.')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        onChange(canvas.toDataURL('image/jpeg', 0.78))
        setError('')
      }
      image.onerror = () => setError('This image could not be opened.')
      image.src = String(reader.result)
    }
    reader.onerror = () => setError('Unable to read this image.')
    reader.readAsDataURL(file)
  }
  return <div className="image-picker"><label className="form-label">{value ? 'Replace product image' : 'Add product image'}<input type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0])} /></label>{value && <div className="image-picker-preview"><img src={value} alt="Current product image preview" /><button type="button" className="table-action" onClick={() => onChange('')}>Remove image</button></div>}{error && <span className="image-error">{error}</span>}</div>
}
function StockForm({ item, onSave }: { item: StockItem | null; onSave: (item: StockItem) => void }) { const [name, setName] = useState(item?.name || ''); const [quantity, setQuantity] = useState(String(item?.quantity || '')); const [unit, setUnit] = useState(item?.unit || 'pcs'); const [low, setLow] = useState(String(item?.low || '')); return <><label className="form-label">Item name<input placeholder="e.g. Vanilla syrup" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="form-row"><label className="form-label">Quantity<input type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="form-label">Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label></div><label className="form-label">Reorder point<input type="number" min="0" value={low} onChange={(event) => setLow(event.target.value)} /></label><button className="primary-button full-width" onClick={() => { if (!name.trim()) return; onSave({ id: item?.id || `stock-${Date.now()}`, name: name.trim(), quantity: Number(quantity), unit, low: Number(low) }) }}>Save inventory <Check size={15} /></button></> }


export default App
