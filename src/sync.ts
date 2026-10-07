import type { Product } from './menu'

export type StoreSnapshot = {
  schemaVersion: 1
  deviceId: string
  sentAt: string
  products: Product[]
  transactions: unknown[]
  stock: unknown[]
  stockMovements: unknown[]
  customers: unknown[]
  staff: unknown[]
  audit: string[]
}

export async function syncStore(endpoint: string, snapshot: StoreSnapshot): Promise<StoreSnapshot> {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(snapshot),
  })

  if (!response.ok) throw new Error(`Sync endpoint returned ${response.status}`)
  const body = await response.json() as { snapshot?: Partial<StoreSnapshot> } & Partial<StoreSnapshot>
  const merged = body.snapshot || body

  if (
    !Array.isArray(merged.products) ||
    !Array.isArray(merged.transactions) ||
    !Array.isArray(merged.stock) ||
    !Array.isArray(merged.stockMovements) ||
    !Array.isArray(merged.customers) ||
    !Array.isArray(merged.staff) ||
    !Array.isArray(merged.audit)
  ) {
    throw new Error('Sync endpoint returned an invalid store snapshot')
  }

  return {
    ...snapshot,
    ...merged,
    deviceId: snapshot.deviceId,
    sentAt: snapshot.sentAt,
    schemaVersion: 1,
  } as StoreSnapshot
}