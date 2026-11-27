import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Archive, ArrowDownToLine, ArrowRight, BarChart3, Bell, Camera, Check, Cloud, CloudOff, ImagePlus,
  ChevronDown, CircleHelp, Clock3, Coffee, CreditCard, FileText, LayoutDashboard, LogOut,
  Mail, MapPin, Minus, Moon, Phone, Plus, Printer, Search, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Sun,
  Pencil, RefreshCw, Tag, Trash2, UserRound, Users, Wallet, X,
} from 'lucide-react'
import { categories, initialProducts, money, type CategoryId, type Product } from './menu'
import { syncStore } from './sync'
import { QRCodeSVG } from 'qrcode.react'
import './CustomerApp.css'

type Role = 'Manager' | 'Cashier' | 'Buyer'
type PaymentMethod = 'Cash' | 'GCash'
type FulfillmentType = 'Dine in' | 'Delivery'
type Theme = 'light' | 'dark'
type AdminAccount = { email: string; passwordHash: string }
type View = 'pos' | 'dashboard' | 'products' | 'inventory' | 'customers' | 'orders' | 'staff' | 'reports' | 'activity' | 'settings' | 'profile'
type CartItem = { key: string; productId: string; name: string; category: CategoryId; variant: string; price: number; sugar: string; addons: string[]; quantity: number; imageData?: string }
type Transaction = { id: string; date: string; items: CartItem[]; total: number; method: string; cashier: string; reference?: string; discount: number; customerId?: string; customerName?: string; customerPhone?: string; customerEmail?: string; customerAddress?: string; fulfillmentType?: FulfillmentType; buyerId?: string; source?: 'buyer'; status?: 'Pending' | 'Accepted' | 'Declined' }
type StockItem = { id: string; name: string; quantity: number; unit: string; low: number }
type StockMovement = { id: string; date: string; itemId: string; itemName: string; action: 'Restock' | 'Adjustment' | 'Sale' | 'Deleted'; change: number; balance: number; actor: string }
type Customer = { id: string; name: string; phone: string; email: string; notes: string; active: boolean; accountId?: string; accountStatus?: 'active' | 'blocked' | 'deleted' }
type StaffMember = { name: string; role: Role; status: 'Active' | 'On leave' }

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
const gcashNumber = '09102733236'
const syncEndpoint = import.meta.env.VITE_SYNC_API_URL?.trim() || ''
const isCustomerApp = __CUSTOMER_APP__
const isCustomerPortal = isCustomerApp || window.location.pathname === '/customer' || window.location.pathname === '/customer.html'
const storedSessionUser = () => {
  if (isCustomerPortal) {
    const savedCustomer = localStorage.getItem('ss-customer-user') || sessionStorage.getItem('ss-customer-user')
    if (savedCustomer) {
      const buyerId = localStorage.getItem('ss-buyer-id')
      const accounts = JSON.parse(localStorage.getItem('ss-customers') || '[]') as Customer[]
      const account = accounts.find((customer) => customer.accountId === buyerId)
      return account?.accountStatus === 'blocked' || account?.accountStatus === 'deleted' ? '' : savedCustomer
    }
    return localStorage.getItem('ss-role') === 'Buyer' ? localStorage.getItem('ss-user') || '' : ''
  }
  const savedRole = localStorage.getItem('ss-role') || sessionStorage.getItem('ss-role')
  if (savedRole === 'Buyer') return ''
  return localStorage.getItem('ss-user') || sessionStorage.getItem('ss-user') || ''
}
const storedSessionRole = (): Role => {
  if (isCustomerPortal) return 'Buyer'
  const saved = localStorage.getItem('ss-role') || sessionStorage.getItem('ss-role')
  return saved === 'Manager' || saved === 'Cashier' ? saved : 'Manager'
}
const sessionUserKey = isCustomerPortal ? 'ss-customer-user' : 'ss-user'
const sessionRoleKey = isCustomerPortal ? 'ss-customer-role' : 'ss-role'
const sessionPhoneKey = isCustomerPortal ? 'ss-customer-phone' : 'ss-buyer-phone'
const storedBuyerPhone = () => localStorage.getItem('ss-buyer-phone') || sessionStorage.getItem('ss-buyer-phone') || ''
const storedBuyerEmail = () => localStorage.getItem('ss-buyer-email') || ''
const storedBuyerAddress = () => localStorage.getItem('ss-buyer-address') || ''
const storedTheme = (): Theme => localStorage.getItem('ss-theme') === 'dark' ? 'dark' : 'light'
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
  const [audit, setAudit] = useState<string[]>(() => JSON.parse(localStorage.getItem('ss-audit') || '[]'))
  const [adminAccount, setAdminAccount] = useState<AdminAccount | null>(() => JSON.parse(localStorage.getItem('ss-admin-account') || 'null'))
  const [user, setUser] = useState(storedSessionUser)
  const [role, setRole] = useState<Role>(storedSessionRole)
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const [buyerPhone, setBuyerPhone] = useState(storedBuyerPhone)
  const [buyerEmail, setBuyerEmail] = useState(storedBuyerEmail)
  const [buyerAddress, setBuyerAddress] = useState(storedBuyerAddress)
  const [buyerFulfillment, setBuyerFulfillment] = useState<FulfillmentType>('Dine in')
  const [buyerPaymentMethod, setBuyerPaymentMethod] = useState<PaymentMethod>('Cash')
  const [buyerDeliveryAddress, setBuyerDeliveryAddress] = useState(storedBuyerAddress)
  const [buyerGcashReference, setBuyerGcashReference] = useState('')
  const [buyerId] = useState(() => {
    const stored = localStorage.getItem('ss-buyer-id')
    if (stored) return stored
    const id = crypto.randomUUID?.() || `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem('ss-buyer-id', id)
    return id
  })
  const [now] = useState(() => new Date())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<'local' | 'pending' | 'syncing' | 'synced' | 'error'>(() => syncEndpoint ? (localStorage.getItem('ss-sync-fingerprint') ? 'synced' : 'pending') : 'local')
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem('ss-last-synced-at') || '')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const syncInFlight = useRef(false)
  const syncQueued = useRef(false)
  const [view, setView] = useState<View>(() => user && role === 'Manager' ? 'dashboard' : 'pos')
  const [reportRange, setReportRange] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [productListMode, setProductListMode] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [variantIndex, setVariantIndex] = useState(0)
  const [sugar, setSugar] = useState('100%')
  const [addons, setAddons] = useState<string[]>([])
  const [discount, setDiscount] = useState(0)
  const [promo, setPromo] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('Cash')
  const [cashReceived, setCashReceived] = useState('')
  const [receipt, setReceipt] = useState<Transaction | null>(null)
  const [modal, setModal] = useState<'product' | 'payment' | 'staff' | 'stock' | 'discount' | 'login' | 'new-product' | 'customer' | null>(() => isCustomerPortal && !user ? 'login' : null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState<Role>('Cashier')
  const [stockEdit, setStockEdit] = useState<StockItem | null>(null)
  const [notification, setNotification] = useState('')
  const [loginName, setLoginName] = useState('')
  const [loginStage, setLoginStage] = useState<'roles' | 'admin' | 'cashier' | 'buyer'>(() => isCustomerPortal ? 'buyer' : 'roles')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('')
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false)
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
  const [buyerProfileName, setBuyerProfileName] = useState('')
  const [buyerProfilePhone, setBuyerProfilePhone] = useState('')
  const [buyerProfileEmail, setBuyerProfileEmail] = useState('')
  const [buyerProfileAddress, setBuyerProfileAddress] = useState('')
  const [buyerPhoto, setBuyerPhoto] = useState(() => localStorage.getItem('ss-buyer-photo') || '')
  const [buyerProfilePhoto, setBuyerProfilePhoto] = useState('')
  const knownBuyerOrderIds = useRef(new Set(transactions.filter((transaction) => transaction.source === 'buyer').map((transaction) => transaction.id)))
  const knownBuyerOrderStatuses = useRef(new Map(transactions.filter((transaction) => transaction.source === 'buyer').map((transaction) => [transaction.id, transaction.status])))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('ss-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('ss-products', JSON.stringify(products))
    localStorage.setItem('ss-transactions', JSON.stringify(transactions))
    localStorage.setItem('ss-stock', JSON.stringify(stock))
    localStorage.setItem('ss-stock-movements', JSON.stringify(stockMovements))
    localStorage.setItem('ss-customers', JSON.stringify(customers))
    localStorage.setItem('ss-staff', JSON.stringify(staff))
    localStorage.setItem('ss-audit', JSON.stringify(audit))
    if (adminAccount) localStorage.setItem('ss-admin-account', JSON.stringify(adminAccount))
  }, [products, transactions, stock, stockMovements, customers, staff, audit, adminAccount])

  useEffect(() => {
    if (!user) return
    localStorage.setItem(sessionUserKey, user)
    localStorage.setItem(sessionRoleKey, role)
    if (role === 'Buyer') {
      localStorage.setItem('ss-buyer-phone', buyerPhone)
      localStorage.setItem('ss-buyer-email', buyerEmail)
      localStorage.setItem('ss-buyer-address', buyerAddress)
      if (isCustomerPortal && localStorage.getItem('ss-role') === 'Buyer') {
        localStorage.removeItem('ss-user')
        localStorage.removeItem('ss-role')
        sessionStorage.removeItem('ss-user')
        sessionStorage.removeItem('ss-role')
      }
    }
    sessionStorage.removeItem(sessionUserKey)
    sessionStorage.removeItem(sessionRoleKey)
    sessionStorage.removeItem(sessionPhoneKey)
  }, [user, role, buyerPhone, buyerEmail, buyerAddress])

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
  const todayTransactions = transactions.filter((item) => item.status !== 'Pending' && item.status !== 'Declined' && sameLocalDay(item.date, now))
  const todaySales = todayTransactions.reduce((sum, item) => sum + item.total, 0)
  const visibleTransactions = role === 'Manager' ? transactions : role === 'Buyer' ? transactions.filter((item) => item.source === 'buyer' && item.buyerId === buyerId) : transactions.filter((item) => item.cashier === user)
  const visibleTodayTransactions = visibleTransactions.filter((item) => item.status !== 'Pending' && item.status !== 'Declined' && sameLocalDay(item.date, now))
  const periodTransactions = visibleTransactions.filter((item) => item.status !== 'Pending' && item.status !== 'Declined' && isWithinPeriod(item.date, periodStart(now, reportRange), now))
  const periodSales = periodTransactions.reduce((sum, item) => sum + item.total, 0)
  const lowStock = stock.filter((item) => item.quantity <= item.low)
  const snapshotFingerprint = JSON.stringify({ products, transactions, stock, stockMovements, customers, staff, audit })
  const snapshotIsSynced = snapshotFingerprint === localStorage.getItem('ss-sync-fingerprint')
  const syncLabel = !isOnline ? 'Offline · saved locally' : !syncEndpoint ? 'Online · device only' : syncStatus === 'syncing' ? 'Syncing…' : snapshotIsSynced || syncStatus === 'synced' ? 'Synced' : syncStatus === 'error' ? 'Sync failed · retry' : 'Waiting to sync'
  const syncTitle = lastSyncedAt ? `${syncLabel}. Last sync ${new Date(lastSyncedAt).toLocaleString()}` : `${syncLabel}. Configure VITE_SYNC_API_URL for cloud sync.`
  const selectedCustomer = customers.find((customer) => customer.id === currentCustomerId && customer.active)
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
    if (!syncEndpoint || !isOnline || (snapshotIsSynced && syncAttempt === 0)) return

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
      }).catch((error: unknown) => {
        console.error('Store sync failed:', error)
        setSyncStatus('error')
      }).finally(() => {
        syncInFlight.current = false
        if (syncQueued.current) {
          syncQueued.current = false
          setSyncAttempt((attempt) => attempt + 1)
        } else setSyncAttempt(0)
      })
    }, syncAttempt === 0 ? 700 : 0)

    return () => window.clearTimeout(timer)
  }, [isOnline, syncAttempt, snapshotFingerprint, snapshotIsSynced, products, transactions, stock, stockMovements, customers, staff, audit])
  useEffect(() => {
    if (!syncEndpoint || !isOnline) return
    const interval = window.setInterval(() => setSyncAttempt((attempt) => attempt + 1), 8000)
    return () => window.clearInterval(interval)
  }, [isOnline])
  const addAudit = (message: string) => setAudit((items) => [`${currentTimestamp()} · ${user || 'System'} · ${message}`, ...items].slice(0, 100))
  const notify = (message: string) => { setNotification(message); window.setTimeout(() => setNotification(''), 2500) }

  useEffect(() => {
    if (!isCustomerPortal) return
    const handleCustomerAccounts = (event: StorageEvent) => {
      if (event.key !== 'ss-customers') return
      try {
        const nextCustomers = event.newValue ? JSON.parse(event.newValue) as Customer[] : []
        setCustomers(nextCustomers)
        const account = nextCustomers.find((customer) => customer.accountId === buyerId)
        if (role === 'Buyer' && user && (account?.accountStatus === 'blocked' || account?.accountStatus === 'deleted')) {
          localStorage.removeItem(sessionUserKey)
          localStorage.removeItem(sessionRoleKey)
          localStorage.removeItem(sessionPhoneKey)
          sessionStorage.removeItem(sessionUserKey)
          sessionStorage.removeItem(sessionRoleKey)
          sessionStorage.removeItem(sessionPhoneKey)
          setUser('')
          setBuyerPhone('')
          setCart([])
          setView('pos')
          notify('This customer account is no longer active. Please contact the shop.')
        }
      } catch (error) {
        console.error('Unable to read customer account updates:', error)
      }
    }
    window.addEventListener('storage', handleCustomerAccounts)
    return () => window.removeEventListener('storage', handleCustomerAccounts)
  }, [buyerId, role, user])

  useEffect(() => {
    if (role !== 'Manager') return
    transactions.forEach((transaction) => {
      if (transaction.source !== 'buyer' || transaction.status !== 'Pending' || knownBuyerOrderIds.current.has(transaction.id)) return
      knownBuyerOrderIds.current.add(transaction.id)
      notify(`New order from ${transaction.customerName || 'a customer'} · ${money(transaction.total)}`)
    })
  }, [transactions, role])
  useEffect(() => {
    if (role !== 'Buyer') return
    transactions.forEach((transaction) => {
      if (transaction.source !== 'buyer' || transaction.buyerId !== buyerId) return
      const previousStatus = knownBuyerOrderStatuses.current.get(transaction.id)
      knownBuyerOrderStatuses.current.set(transaction.id, transaction.status)
      if (previousStatus && transaction.status && previousStatus !== transaction.status) {
        notify(transaction.status === 'Accepted' ? `Good news! Your order ${transaction.id} was accepted.` : `Your order ${transaction.id} was declined by the shop.`)
      }
    })
  }, [transactions, role, buyerId])

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
    const extra = addons.length * 10
    const key = `${selected.id}-${variant.name}-${sugar}-${addons.join(',')}`
    setCart((items) => {
      const existing = items.find((item) => item.key === key)
      return existing ? items.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item) :
        [...items, { key, productId: selected.id, name: selected.name, category: selected.category, variant: variant.name, price: variant.price + extra, sugar, addons, quantity: 1, imageData: selected.imageData }]
    })
    setModal(null)
  }
  const updateQuantity = (key: string, amount: number) => setCart((items) => items.map((item) => item.key === key ? { ...item, quantity: item.quantity + amount } : item).filter((item) => item.quantity > 0))
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
  const checkoutBuyerOrder = () => {
    if (!cart.length) return notify('Add something delicious to your order first.')
    if (!user.trim()) return notify('Please sign in again before placing your order.')
    setBuyerFulfillment('Dine in')
    setBuyerPaymentMethod('Cash')
    setBuyerDeliveryAddress(buyerAddress)
    setBuyerGcashReference('')
    setModal('payment')
  }
  const submitBuyerOrder = () => {
    if (buyerFulfillment === 'Delivery' && buyerDeliveryAddress.trim().length < 8) return notify('Enter a complete delivery address.')
    if (buyerPaymentMethod === 'GCash' && buyerGcashReference.trim().length < 4) return notify('Enter the GCash reference number to continue.')
    const order: Transaction = {
      id: `WEB-${Date.now().toString().slice(-8)}`,
      date: new Date().toISOString(),
      items: cart,
      total,
      method: buyerPaymentMethod,
      reference: buyerPaymentMethod === 'GCash' ? buyerGcashReference.trim() : undefined,
      cashier: 'Online order',
      discount: 0,
      customerName: user,
      customerPhone: buyerPhone || undefined,
      customerEmail: buyerEmail || undefined,
      customerAddress: buyerFulfillment === 'Delivery' ? buyerDeliveryAddress.trim() : undefined,
      fulfillmentType: buyerFulfillment,
      buyerId,
      source: 'buyer',
      status: 'Pending',
    }
    if (buyerFulfillment === 'Delivery') {
      setBuyerAddress(buyerDeliveryAddress.trim())
      localStorage.setItem('ss-buyer-address', buyerDeliveryAddress.trim())
    }
    knownBuyerOrderIds.current.add(order.id)
    knownBuyerOrderStatuses.current.set(order.id, 'Pending')
    setTransactions((items) => [order, ...items])
    setCart([])
    setModal(null)
    setView('orders')
    notify('Order placed! We’ll let you know when the shop responds.')
  }
  const setBuyerOrderStatus = (id: string, status: 'Accepted' | 'Declined') => {
    const order = transactions.find((item) => item.id === id)
    if (!order || order.source !== 'buyer' || order.status !== 'Pending') return
    setTransactions((items) => items.map((item) => item.id === id ? { ...item, status } : item))
    addAudit(`${status} online order ${id} · ${money(order.total)}`)
    if (status === 'Accepted') {
      const nextStock = stock.map((stockItem) => {
        if (!stockItem.id.startsWith('cups-')) return stockItem
        const sizeKey = stockItem.id === 'cups-12' ? /small|12oz/i : stockItem.id === 'cups-16' ? /medium|16oz/i : /large|22oz/i
        const used = order.items.filter((line) => line.category !== 'dessert' && sizeKey.test(line.variant)).reduce((quantity, line) => quantity + line.quantity, 0)
        return used ? { ...stockItem, quantity: Math.max(0, stockItem.quantity - used) } : stockItem
      })
      const movements = nextStock.flatMap((item) => {
        const previous = stock.find((oldItem) => oldItem.id === item.id)
        const change = item.quantity - (previous?.quantity ?? item.quantity)
        return change ? [{ id: `move-${Date.now()}-${item.id}`, date: new Date().toISOString(), itemId: item.id, itemName: item.name, action: 'Sale' as const, change, balance: item.quantity, actor: user }] : []
      })
      setStock(nextStock)
      if (movements.length) setStockMovements((items) => [...movements, ...items].slice(0, 500))
    }
    notify(`Order ${id} ${status.toLowerCase()}.`)
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
  const recordSignIn = (name: string, selectedRole: Role, phone = '') => {
    setRole(selectedRole)
    setUser(name)
    localStorage.setItem(sessionUserKey, name)
    localStorage.setItem(sessionRoleKey, selectedRole)
    sessionStorage.setItem(sessionUserKey, name)
    sessionStorage.setItem(sessionRoleKey, selectedRole)
    if (selectedRole === 'Buyer') {
      setBuyerPhone(phone)
      localStorage.setItem('ss-buyer-phone', phone)
      sessionStorage.setItem(sessionPhoneKey, phone)
      setCart([])
      setCategory('all')
      setSearch('')
    }
    setAudit((items) => [`${currentTimestamp()} · ${name} (${selectedRole}) · Signed in`, ...items].slice(0, 100))
    setModal(null)
    setView(selectedRole === 'Manager' ? 'dashboard' : 'pos')
  }
  const saveBuyerAccount = (name: string, phone: string, email = '') => {
    setCustomers((items) => {
      const existing = items.find((item) => item.accountId === buyerId)
      const account: Customer = {
        id: existing?.id || `portal-${buyerId}`,
        accountId: buyerId,
        accountStatus: existing?.accountStatus || 'active',
        name,
        phone,
        email,
        notes: existing?.notes || '',
        active: true,
      }
      return existing ? items.map((item) => item.accountId === buyerId ? account : item) : [...items, account]
    })
  }
  const signOut = () => {
    if (!window.confirm('Are you sure you want to sign out? You will need to sign in again to continue.')) return
    localStorage.removeItem(sessionUserKey)
    localStorage.removeItem(sessionRoleKey)
    localStorage.removeItem(sessionPhoneKey)
    sessionStorage.removeItem(sessionUserKey)
    sessionStorage.removeItem(sessionRoleKey)
    sessionStorage.removeItem(sessionPhoneKey)
    if (isCustomerPortal && localStorage.getItem('ss-role') === 'Buyer') {
      localStorage.removeItem('ss-user')
      localStorage.removeItem('ss-role')
      sessionStorage.removeItem('ss-user')
      sessionStorage.removeItem('ss-role')
    }
    setUser('')
    setBuyerPhone('')
    setCart([])
    setView('pos')
  }
  const saveBuyerProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = buyerProfileName.trim()
    if (name.length < 2) return notify('Please enter a name with at least 2 characters.')
    const account = customers.find((customer) => customer.accountId === buyerId)
    if (account?.accountStatus === 'blocked' || account?.accountStatus === 'deleted') return notify('This customer account is no longer active. Please contact the shop.')
    try {
      if (buyerProfilePhoto) localStorage.setItem('ss-buyer-photo', buyerProfilePhoto)
      else localStorage.removeItem('ss-buyer-photo')
    } catch (error) {
      console.error('Unable to save customer profile photo:', error)
      notify('Unable to save your profile photo on this device. Try a smaller image.')
      return
    }
    setUser(name)
    setBuyerPhone(buyerProfilePhone.trim())
    setBuyerEmail(buyerProfileEmail.trim())
    setBuyerAddress(buyerProfileAddress.trim())
    setBuyerPhoto(buyerProfilePhoto)
    saveBuyerAccount(name, buyerProfilePhone.trim(), buyerProfileEmail.trim())
    localStorage.setItem(sessionUserKey, name)
    localStorage.setItem('ss-buyer-phone', buyerProfilePhone.trim())
    localStorage.setItem('ss-buyer-email', buyerProfileEmail.trim())
    localStorage.setItem('ss-buyer-address', buyerProfileAddress.trim())
    sessionStorage.setItem(sessionUserKey, name)
    sessionStorage.setItem(sessionPhoneKey, buyerProfilePhone.trim())
    setView('profile')
    notify('Your profile has been updated.')
  }
  const hashAdminPassword = async (email: string, password: string) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${email.toLowerCase()}:${password}`))
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  const submitAdminSignIn = async () => {
    if (isAdminSubmitting) return
    const email = adminEmail.trim().toLowerCase()
    if (!/^[-a-z0-9._%+]+@gmail\.com$/.test(email)) return notify('Use the authorized Gmail address.')
    if (adminPassword.length < 8) return notify('Password must be at least 8 characters.')
    if (!adminAccount && adminPassword !== confirmAdminPassword) return notify('Passwords do not match.')

    setIsAdminSubmitting(true)
    try {
      if (!adminAccount) {
        const passwordHash = await hashAdminPassword(email, adminPassword)
        setAdminAccount({ email, passwordHash })
        setAdminEmail('')
        setAdminPassword('')
        setConfirmAdminPassword('')
        recordSignIn(email, 'Manager')
        return
      }
      if (email !== adminAccount.email || await hashAdminPassword(email, adminPassword) !== adminAccount.passwordHash) {
        return notify('Email or password is incorrect.')
      }
      setAdminEmail('')
      setAdminPassword('')
      recordSignIn(email, 'Manager')
    } catch (error) {
      console.error('Admin sign-in failed:', error)
      notify('Unable to verify admin credentials. Please try again.')
    } finally {
      setIsAdminSubmitting(false)
    }
  }
  const submitCashierSignIn = () => {
    const name = loginName.trim()
    if (name.length < 2) return notify('Enter the cashier’s name before continuing.')
    recordSignIn(name, 'Cashier')
  }
  const submitBuyerSignIn = () => {
    const name = loginName.trim()
    if (name.length < 2) return notify('Please enter your name to continue.')
    const phone = buyerPhone.trim()
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length < 7 || phoneDigits.length > 15) return notify('Enter a valid mobile number to continue.')
    const existingAccount = customers.find((customer) => customer.accountId === buyerId)
    if (existingAccount?.accountStatus === 'blocked') return notify('This customer account is blocked. Please contact the shop.')
    if (existingAccount?.accountStatus === 'deleted') return notify('This customer account was deleted. Please contact the shop.')
    setDiscount(0)
    saveBuyerAccount(name, phone, buyerEmail)
    recordSignIn(name, 'Buyer', phone)
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
  const pendingBuyerOrders = transactions.filter((transaction) => transaction.source === 'buyer' && transaction.status === 'Pending')
  const buyerOrders = transactions.filter((transaction) => transaction.source === 'buyer' && transaction.buyerId === buyerId).sort((first, second) => second.date.localeCompare(first.date))
  const completedBuyerOrders = buyerOrders.filter((order) => order.status === 'Accepted' || !order.status)
  const profileSpent = completedBuyerOrders.reduce((sum, order) => sum + order.total, 0)
  const openBuyerProfile = () => {
    setBuyerProfileName(user)
    setBuyerProfilePhone(buyerPhone)
    setBuyerProfileEmail(buyerEmail)
    setBuyerProfileAddress(buyerAddress)
    setBuyerProfilePhoto(buyerPhoto)
    setView('profile')
  }

  if (!user) return <div className="welcome-page">
    <div className="welcome-grain" />
    <div className="welcome-content"><div className="sparkle sparkle-a">✦</div><div className="sparkle sparkle-b">✧</div>
      <LogoMark />
      <p className="welcome-eyebrow">{isCustomerPortal ? 'CUSTOMER LOGIN' : 'YOUR NEIGHBORHOOD SIP STOP'}</p>
      <h1>{isCustomerPortal ? <>Order something<br /><em>lovely.</em></> : <>Good things<br /><em>are brewing.</em></>}</h1>
      <p className="welcome-copy">{isCustomerPortal ? 'Browse the menu, place an order, and follow its status.' : 'Made with love, just for you.'}</p>
      <button className="welcome-button" onClick={() => { setLoginName(''); setLoginStage(isCustomerPortal ? 'buyer' : 'roles'); setModal('login') }}>{isCustomerPortal ? 'Customer login' : 'Staff sign in'} <ArrowRight size={17} /></button>
      {!isCustomerPortal && <a className="customer-portal-link" href="/customer.html?login=1">Customer login <ArrowRight size={13} /></a>}
      <div className="welcome-contact"><span>[redacted-phone]</span><span>@shotsandsparkles</span></div>
      <div className="welcome-footer">HANDCRAFTED DAILY <i>·</i> SHARED WITH JOY</div>
    </div>
    {modal === 'login' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog role-dialog" onClick={(event) => event.stopPropagation()}>
      <button className="icon-button dialog-close" onClick={() => { setModal(null); setLoginStage('roles') }} aria-label="Close"><X size={18} /></button>
      <LogoMark compact />
      {!isCustomerPortal && loginStage === 'roles' && <><h2>Welcome to the counter</h2><p>Choose how you’re signing in.</p>
        <button className="role-choice" onClick={() => setLoginStage('admin')}><ShieldCheck size={20} /><span><b>Admin sign in</b><small>Single authorized Gmail account</small></span><ArrowRight size={16} /></button>
        <button className="role-choice" onClick={() => { setLoginName(''); setLoginStage('cashier') }}><UserRound size={20} /><span><b>Cashier sign in</b><small>Enter your name for the shift log</small></span><ArrowRight size={16} /></button>
      </>}
      {loginStage === 'admin' && <><button className="back-link" onClick={() => setLoginStage('roles')}><ArrowRight size={14} /> Back to roles</button><h2>{adminAccount ? 'Admin sign in' : 'Set up the admin account'}</h2><p>{adminAccount ? 'Sign in with the one authorized Gmail account.' : 'Create the one admin account for this store on this device.'}</p>
        <form onSubmit={(event) => { event.preventDefault(); void submitAdminSignIn() }}>
          <label className="form-label">Admin Gmail<input type="email" autoComplete="username" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="owner@gmail.com" /></label>
          <label className="form-label">Password<input type="password" autoComplete={adminAccount ? 'current-password' : 'new-password'} value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          {!adminAccount && <label className="form-label">Confirm password<input type="password" autoComplete="new-password" value={confirmAdminPassword} onChange={(event) => setConfirmAdminPassword(event.target.value)} placeholder="Enter password again" /></label>}
          <button className="primary-button full-width" type="submit" disabled={isAdminSubmitting}>{isAdminSubmitting ? 'Verifying…' : adminAccount ? 'Sign in as admin' : 'Create admin account'} <ArrowRight size={15} /></button>
        </form>
        <small className="demo-note">Single account stored on this device. For production, connect Google OAuth and a secure server.</small>
      </>}
      {loginStage === 'cashier' && <><button className="back-link" onClick={() => setLoginStage('roles')}><ArrowRight size={14} /> Back to roles</button><h2>Cashier sign in</h2><p>Your name will be attached to orders and shift activity.</p>
        <label className="form-label">Cashier name<input autoComplete="name" value={loginName} onChange={(event) => setLoginName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitCashierSignIn() }} placeholder="Enter your full name" /></label>
        <button className="primary-button full-width" onClick={submitCashierSignIn}>Continue to POS <ArrowRight size={15} /></button>
      </>}
      {isCustomerPortal && loginStage === 'buyer' && <><h2>Customer login</h2><p>Enter your name and mobile number to continue.</p>
        <form onSubmit={(event) => { event.preventDefault(); submitBuyerSignIn() }}>
          <label className="form-label">Your name<input autoComplete="name" value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Enter your name" required minLength={2} /></label>
          <label className="form-label">Mobile number<input type="tel" autoComplete="tel" inputMode="tel" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} placeholder="09xx xxx xxxx" required /></label>
          <button className="primary-button full-width" type="submit">Continue to the menu <ArrowRight size={15} /></button>
        </form>
      </>}
    </div></div>}
    {notification && <div className="toast">{notification}</div>}
  </div>

  return <div className={`app-shell${role === 'Buyer' ? ' buyer-shell' : ''}`}>
    {role !== 'Buyer' && <aside className="sidebar">
      <div className="sidebar-brand"><LogoMark compact /><span className="brand-caption">STORE MANAGEMENT</span></div>
      <div className="store-switch"><span className="store-dot" /><span><b>Shots & Sparkles</b><small>San Isidro · Main store</small></span><ChevronDown size={15} /></div>
      <div className="nav-heading">WORKSPACE</div>
      <nav>{navItems.filter((item) => !item.managerOnly || role === 'Manager').map((item) => {
        const Icon = item.icon
        return <button key={item.id} className={`nav-link${view === item.id ? ' active' : ''}`} onClick={() => setView(item.id)} aria-label={item.label} title={item.label}><Icon size={18} /><span>{item.label}</span>{item.id === 'inventory' && lowStock.length > 0 && <b className="nav-count">{lowStock.length}</b>}{item.id === 'orders' && pendingBuyerOrders.length > 0 && role === 'Manager' && <b className="nav-count">{pendingBuyerOrders.length}</b>}</button>
      })}</nav>
      <div className="sidebar-bottom"><div className="shift-card"><div><span className="live-dot" /> SHIFT IN PROGRESS</div><strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><small>Started today</small></div>
        <button className="user-card" onClick={() => setModal('login')}><div className="avatar">{user.charAt(0).toUpperCase()}</div><span><b>{user}</b><small>{role}</small></span><ChevronDown size={15} /></button>
        <button className="logout-button" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </div>
    </aside>}
    <main className="main-area">
      <header className={`topbar${role === 'Buyer' ? ' buyer-topbar' : ''}`}>
        <div className="breadcrumb">{role === 'Buyer' ? <><LogoMark compact /><b>Shots & Sparkles</b></> : <><span>Workspace</span><span>/</span><b>{navItems.find((item) => item.id === view)?.label}</b></>}</div>
        <div className="top-actions">
          {role === 'Buyer' && <nav className="buyer-nav"><button type="button" className={view === 'pos' ? 'active' : ''} onClick={() => setView('pos')}>Menu</button><button type="button" className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}>My orders{buyerOrders.some((order) => order.status === 'Pending') && <i />}</button><button type="button" className={view === 'profile' ? 'active' : ''} onClick={openBuyerProfile}>Profile</button></nav>}
          <button type="button" className="theme-toggle" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-pressed={theme === 'dark'} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className={`sync-indicator ${!isOnline ? 'offline' : !syncEndpoint ? 'device-only' : syncStatus}`} title={syncTitle} onClick={() => setSyncAttempt((attempt) => attempt + 1)} aria-label={syncLabel}>{!isOnline ? <CloudOff size={14} /> : syncStatus === 'syncing' ? <RefreshCw size={14} className="spin" /> : <Cloud size={14} />}<span>{syncLabel}</span></button>
          {role !== 'Buyer' && <><div className="today-label"><Clock3 size={15} /> {now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</div><button className="icon-button notification-button" onClick={() => { if (pendingBuyerOrders.length) { setView('orders'); notify(`${pendingBuyerOrders.length} customer order${pendingBuyerOrders.length === 1 ? '' : 's'} waiting for review.`) } else notify(lowStock.length ? `${lowStock.length} low-stock alerts` : 'You are all caught up.') }} aria-label="Notifications"><Bell size={18} />{(lowStock.length > 0 || pendingBuyerOrders.length > 0) && <i />}</button></>}
          {role !== 'Buyer' && <button className="top-avatar" aria-label="Sign out" title={`Sign out ${user}`} onClick={signOut}>{user.charAt(0).toUpperCase()}</button>}
        </div>
      </header>
      <div className="page-content">
        {view === 'pos' && role === 'Buyer' && <BuyerStore products={visibleProducts} category={category} search={search} cart={cart} subtotal={subtotal} tax={tax} total={total} connectionNotice={!syncEndpoint ? 'Preview mode: your orders are shared with the admin only on this device. Set up cloud sync before inviting customers on other devices.' : !isOnline ? 'You’re offline. New orders will stay on this device until your connection returns.' : syncStatus === 'error' ? 'The shop connection is having trouble. Your order may not have reached the team yet; try syncing again.' : ''} onCategoryChange={setCategory} onSearchChange={setSearch} onStartOrder={startOrder} onQuantityChange={updateQuantity} onClearCart={() => setCart([])} onSubmitOrder={checkoutBuyerOrder} onViewOrders={() => setView('orders')} onViewCart={() => document.getElementById('buyer-cart')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />}
        {view === 'orders' && role === 'Buyer' && <BuyerOrderHistory orders={buyerOrders} onShop={() => setView('pos')} />}
        {view === 'profile' && role === 'Buyer' && <BuyerProfilePage
          name={buyerProfileName}
          phone={buyerProfilePhone}
          email={buyerProfileEmail}
          address={buyerProfileAddress}
          photo={buyerProfilePhoto}
          orderCount={buyerOrders.length}
          completedCount={completedBuyerOrders.length}
          pendingCount={buyerOrders.filter((order) => order.status === 'Pending').length}
          totalSpent={profileSpent}
          onNameChange={setBuyerProfileName}
          onPhoneChange={setBuyerProfilePhone}
          onEmailChange={setBuyerProfileEmail}
          onAddressChange={setBuyerProfileAddress}
          onPhotoChange={setBuyerProfilePhoto}
          onSave={saveBuyerProfile}
          onOrders={() => setView('orders')}
          onShop={() => setView('pos')}
          onSignOut={signOut}
        />}
        {view === 'pos' && role !== 'Buyer' && <>
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
            <aside className="cart-panel"><div className="cart-header"><div><h2>Current order</h2><select className="customer-select" aria-label="Select customer" value={currentCustomerId} onChange={(event) => setCurrentCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.filter((customer) => customer.active).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><button className="text-button" onClick={() => setCart([])} disabled={!cart.length}>Clear</button></div>
              <div className="order-meta"><span><span className="order-dot" /> NEW ORDER</span><b>#{String(transactions.length + 1).padStart(4, '0')}</b></div>
              <div className="cart-items">{cart.length ? cart.map((item) => <div className="cart-row" key={item.key}><div className="cart-item-art">{item.imageData ? <img src={item.imageData} alt="" /> : <Coffee size={17} />}</div><div className="cart-item-detail"><b>{item.name}</b><span>{item.variant} · {item.sugar} sugar{item.addons.length ? ` · ${item.addons.join(', ')}` : ''}</span><strong>{money(item.price * item.quantity)}</strong></div><div className="quantity-control"><button onClick={() => updateQuantity(item.key, -1)} aria-label="Decrease quantity"><Minus size={12} /></button><b>{item.quantity}</b><button onClick={() => updateQuantity(item.key, 1)} aria-label="Increase quantity"><Plus size={12} /></button></div></div>) : <div className="cart-empty"><div className="empty-bag"><ShoppingBag size={22} /></div><b>Your order is waiting</b><span>Tap a menu favorite to add it here.</span></div>}</div>
              <div className="cart-bottom"><button className="promo-link" onClick={() => setModal('discount')}><Tag size={15} /> Add discount or promo <Plus size={14} /></button>{discount > 0 && <div className="discount-row"><span>Discount applied</span><b>−{money(discount)}</b></div>}<div className="summary-line"><span>Subtotal</span><b>{money(subtotal)}</b></div><div className="summary-line"><span>VAT <small>12%</small></span><b>{money(tax)}</b></div><div className="total-line"><b>Total due</b><strong>{money(total)}</strong></div><button className="checkout-button" onClick={checkout} disabled={!cart.length}><span><CreditCard size={17} /> Charge customer</span><b>{money(total)} <ArrowRight size={16} /></b></button><div className="secure-note"><ShieldCheck size={12} /> Secure checkout · Tax included</div></div>
            </aside>
          </div>
          <div className="pos-footnote"><span><Sparkles size={14} /> Made fresh, made for you</span><span>Need a hand? <button onClick={() => notify('Ask your manager for support.')}>Get help <CircleHelp size={13} /></button></span></div>
        </>}

        {view === 'dashboard' && <>
          <div className="page-heading"><div><span className="eyebrow">STORE AT A GLANCE</span><h1>Good morning, {user.split(' ')[0]}.</h1><p>Here’s how your shop is doing today.</p></div><button className="outline-button" onClick={() => setView('reports')}><ArrowDownToLine size={16} /> Export report</button></div>
          <div className="metric-grid"><Metric label="Today's sales" value={money(todaySales)} change="From completed orders" icon={Wallet} tone="green" /><Metric label="Orders today" value={String(todayTransactions.length).padStart(2, '0')} change="Transactions completed" icon={ShoppingBag} tone="gold" /><Metric label="Average order" value={money(todayTransactions.length ? todaySales / todayTransactions.length : 0)} change="Per transaction" icon={Activity} tone="pink" /><Metric label="Low stock alerts" value={String(lowStock.length).padStart(2, '0')} change={lowStock.length ? 'Items need a restock' : 'All supplies in good shape'} icon={Archive} tone="brown" /></div>
          <div className="dashboard-grid"><section className="content-panel sales-panel"><div className="panel-heading"><div><h2>Sales overview</h2><span>Revenue over the last 7 days</span></div><select defaultValue="7 days"><option>7 days</option><option>30 days</option></select></div><SalesChart transactions={transactions.filter((transaction) => transaction.status !== 'Pending' && transaction.status !== 'Declined')} now={now} /></section><section className="content-panel"><div className="panel-heading"><div><h2>Top picks</h2><span>Most ordered this week</span></div><button className="tiny-link" onClick={() => setView('reports')}>Full report <ArrowRight size={13} /></button></div><TopProducts transactions={transactions.filter((transaction) => transaction.status !== 'Pending' && transaction.status !== 'Declined')} /></section></div>
          <section className="content-panel recent-panel"><div className="panel-heading"><div><h2>Recent orders</h2><span>Your latest activity</span></div><button className="tiny-link" onClick={() => setView('orders')}>View all <ArrowRight size={13} /></button></div><TransactionTable transactions={transactions.slice(0, 5)} onReceipt={setReceipt} /></section>
        </>}

        {view === 'products' && <>
          <section className="menu-management">
            <div className="menu-management-heading"><div><h1>Menu Management</h1><p>Manage products, prices, and availability</p></div><button className="primary-button" onClick={() => setModal('new-product')}><Plus size={16} /> Add Product</button></div>
            <div className="menu-management-tools"><label className="search-field"><Search size={17} /><input placeholder="Search products..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={category} onChange={(event) => setCategory(event.target.value as CategoryId | 'all')}><option value="all">All Categories</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><button className={`archive-filter${productListMode === 'archived' ? ' selected' : ''}`} onClick={() => setProductListMode(productListMode === 'active' ? 'archived' : 'active')}><Archive size={16} />{productListMode === 'active' ? 'Show Archived' : 'Show Active'}</button></div>
            <div className="menu-product-grid">{products.filter((item) => item.archived === (productListMode === 'archived') && (category === 'all' || item.category === category) && item.name.toLowerCase().includes(search.toLowerCase())).map((item) => <MenuProductCard key={item.id} product={item} onEdit={() => setEditProduct(item)} onToggle={() => { setProducts((list) => list.map((entry) => entry.id === item.id ? { ...entry, active: !entry.active } : entry)); addAudit(`Changed availability for ${item.name}`) }} onArchive={() => { setProducts((list) => list.map((entry) => entry.id === item.id ? { ...entry, archived: !entry.archived } : entry)); addAudit(`${item.archived ? 'Restored' : 'Archived'} product ${item.name}`) }} />)}</div>
            {!products.some((item) => item.archived === (productListMode === 'archived') && (category === 'all' || item.category === category) && item.name.toLowerCase().includes(search.toLowerCase())) && <div className="menu-empty"><Coffee size={24} /><b>No products here yet</b><span>Adjust the filters or add a menu item.</span></div>}
          </section>
          {editProduct && <ProductEditor product={editProduct} onClose={() => setEditProduct(null)} onSave={(next) => { setProducts((list) => list.map((item) => item.id === next.id ? next : item)); addAudit(`Updated product ${next.name}`); setEditProduct(null) }} />}
        </>}

        {view === 'inventory' && <><PageTitle eyebrow="SUPPLIES & INGREDIENTS" title="Inventory" subtitle="Manage stock levels, restocks, and reorder points." action={<button className="primary-button" onClick={() => { setStockEdit(null); setModal('stock') }}><Plus size={16} /> Add stock item</button>} /><div className="metric-grid inventory-metrics"><Metric label="Tracked items" value={String(stock.length).padStart(2, '0')} change="Across ingredients & packaging" icon={Archive} tone="green" /><Metric label="Need attention" value={String(lowStock.length).padStart(2, '0')} change={lowStock.length ? 'Below reorder threshold' : 'No restocks needed'} icon={Bell} tone="gold" /><Metric label="Stock movements" value={String(stockMovements.length).padStart(2, '0')} change="Audit-ready movement history" icon={Activity} tone="pink" /></div><div className="alert-banner"><div className="alert-symbol"><Bell size={17} /></div><div><b>{lowStock.length ? `${lowStock.length} items below the reorder point` : 'Everything is looking stocked'}</b><span>{lowStock.length ? lowStock.map((item) => item.name).join(', ') : 'You have no low-stock alerts at the moment.'}</span></div></div><div className="table-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Search inventory..." value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} /></label><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as 'all' | 'low')}><option value="all">All stock</option><option value="low">Low stock only</option></select></div><section className="content-panel table-panel"><div className="panel-heading"><div><h2>Stock levels</h2><span>Adjust quantities, reorder points, and remove obsolete items.</span></div><span className="muted-tag">{stock.length} tracked</span></div><InventoryTable stock={stock.filter((item) => item.name.toLowerCase().includes(stockSearch.toLowerCase()) && (stockFilter === 'all' || item.quantity <= item.low))} onEdit={(item) => { setStockEdit(item); setModal('stock') }} onDelete={(item) => { setStock((items) => items.filter((entry) => entry.id !== item.id)); appendStockMovement({ ...item, quantity: 0 }, -item.quantity, 'Deleted'); addAudit(`Removed inventory item ${item.name}`) }} /></section><section className="content-panel audit-panel"><div className="panel-heading"><div><h2>Stock movement history</h2><span>Restocks, adjustments, sales deductions, and removals.</span></div></div><StockMovementTable movements={stockMovements} /></section></>}

        {view === 'customers' && <><PageTitle eyebrow="CUSTOMER BOOK" title="Customers" subtitle="Manage customer details and view each customer’s sales history." action={<button className="primary-button" onClick={() => { setCustomerEdit(null); setModal('customer') }}><Plus size={16} /> Add customer</button>} /><div className="metric-grid"><Metric label="Customer records" value={String(customers.filter((customer) => customer.active).length).padStart(2, '0')} change="Active customer profiles" icon={Users} tone="green" /><Metric label="Linked sales" value={String(transactions.filter((transaction) => transaction.customerId).length).padStart(2, '0')} change="Sales assigned to a customer" icon={ShoppingBag} tone="gold" /></div><div className="table-toolbar"><label className="search-field"><Search size={16} /><input placeholder="Search name, phone, or email..." value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} /></label></div><section className="content-panel table-panel"><CustomerTable customers={customers.filter((customer) => customer.active && `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(customerSearch.toLowerCase()))} sales={transactions} onEdit={(customer) => { setCustomerEdit(customer); setModal('customer') }} onArchive={(customer) => { setCustomers((items) => items.map((item) => item.id === customer.id ? { ...item, active: false } : item)); addAudit(`Archived customer ${customer.name}`) }} onSales={(customer) => { setOrdersCustomerFilter(customer.id); setSearch(''); setView('orders') }} /></section><section className="content-panel audit-panel"><div className="panel-heading"><div><h2>Archived customer records</h2><span>Archived profiles stay attached to their past sales.</span></div></div><CustomerTable customers={customers.filter((customer) => !customer.active)} sales={transactions} onEdit={(customer) => { setCustomerEdit(customer); setModal('customer') }} onArchive={(customer) => setCustomers((items) => items.map((item) => item.id === customer.id ? { ...item, active: true } : item))} onSales={(customer) => { setOrdersCustomerFilter(customer.id); setView('orders') }} archiveLabel="Restore" /></section></>}

        {view === 'orders' && role !== 'Buyer' && <>
          <PageTitle eyebrow={role === 'Manager' && pendingBuyerOrders.length ? 'NEW CUSTOMER ORDERS' : 'SALES REGISTER'} title={pendingBuyerOrders.length && role === 'Manager' ? `${pendingBuyerOrders.length} order${pendingBuyerOrders.length === 1 ? '' : 's'} need a little love.` : 'Sales & receipts'} subtitle="Review online orders, respond to customers, and keep track of every sale." />
          {role === 'Manager' && pendingBuyerOrders.length > 0 && <section className="incoming-orders-panel">
            <div className="incoming-orders-heading"><div className="incoming-orders-icon"><Bell size={18} /></div><div><b>Just in from your customers</b><span>Accept an order to confirm it, or decline if you’re unable to make it.</span></div><span className="incoming-count">{pendingBuyerOrders.length} waiting</span></div>
            <div className="incoming-order-list">{pendingBuyerOrders.map((order) => <article className="incoming-order-card" key={order.id}>
              <div className="incoming-order-main"><div className="incoming-customer"><span className="person-avatar">{(order.customerName || 'C').charAt(0).toUpperCase()}</span><div><b>{order.customerName || 'Customer'}</b><span>{order.customerPhone || order.customerEmail || 'Online customer'} · {new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></div><span className="incoming-order-total">{money(order.total)}</span></div>
              {(order.customerEmail || order.customerAddress) && <div className="incoming-contact-details">{order.customerEmail && <span><Mail size={12} /> {order.customerEmail}</span>}{order.customerAddress && <span><MapPin size={12} /> {order.customerAddress}</span>}</div>}
              <div className="incoming-order-lines">{order.items.map((item, index) => <div key={`${order.id}-${index}`}><span>{item.quantity} × {item.name} <small>{item.variant} · {item.sugar} sugar{item.addons.length ? ` · ${item.addons.join(', ')}` : ''}</small></span><b>{money(item.price * item.quantity)}</b></div>)}</div>
              <div className="incoming-order-actions"><span><CreditCard size={14} /> {order.fulfillmentType || 'Dine in'} · {order.method}{order.reference ? ` · Ref ${order.reference}` : ''} · {order.id}</span><div><button className="decline-order-button" onClick={() => setBuyerOrderStatus(order.id, 'Declined')}><X size={14} /> Decline</button><button className="accept-order-button" onClick={() => setBuyerOrderStatus(order.id, 'Accepted')}><Check size={15} /> Accept order</button></div></div>
            </article>)}</div>
          </section>}
          <div className="metric-grid"><Metric label="Today's sales" value={money(visibleTodayTransactions.reduce((sum, item) => sum + item.total, 0))} change={`${visibleTodayTransactions.length} completed orders today`} icon={Wallet} tone="green" /><Metric label={role === 'Manager' ? 'All orders' : 'Your transactions'} value={String(visibleTransactions.length).padStart(2, '0')} change={pendingBuyerOrders.length ? `${pendingBuyerOrders.length} awaiting response` : 'Saved on this device'} icon={FileText} tone="gold" /></div>
          <section className="content-panel table-panel transactions-page"><div className="panel-heading"><div><h2>{ordersCustomerFilter ? `Sales for ${customers.find((customer) => customer.id === ordersCustomerFilter)?.name || 'customer'}` : role === 'Manager' ? 'Sales & online orders' : 'Your transactions'}</h2><span>Review order status or reprint a completed receipt.</span></div><div className="table-toolbar">{ordersCustomerFilter && <button className="table-action" onClick={() => setOrdersCustomerFilter('')}>All sales</button>}<label className="search-field"><Search size={16} /><input placeholder="Search receipt or customer..." value={search} onChange={(event) => setSearch(event.target.value)} /></label></div></div><TransactionTable transactions={visibleTransactions.filter((item) => (!ordersCustomerFilter || item.customerId === ordersCustomerFilter) && `${item.id} ${item.customerName || ''}`.toLowerCase().includes(search.toLowerCase()))} onReceipt={setReceipt} /></section>
        </>}

        {view === 'staff' && <><PageTitle eyebrow="YOUR LITTLE DREAM TEAM" title="Staff" subtitle="People make the place. Manage your team here." action={<button className="primary-button" onClick={() => setModal('staff')}><Plus size={16} /> Add team member</button>} /><div className="metric-grid"><Metric label="Team members" value={String(staff.length).padStart(2, '0')} change="Across all roles" icon={Users} tone="green" /><Metric label="On shift" value={String(staff.filter((item) => item.status === 'Active').length).padStart(2, '0')} change="Currently active" icon={Activity} tone="gold" /></div><section className="content-panel table-panel"><div className="panel-heading"><div><h2>Your team</h2><span>Roles and account status</span></div></div><div className="table-scroll"><table><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>STATUS</th><th>ACCESS</th><th></th></tr></thead><tbody>{staff.map((member, index) => <tr key={`${member.name}-${index}`}><td><span className="person-cell"><span className="person-avatar">{member.name.charAt(0)}</span><b>{member.name}</b></span></td><td>{member.role}</td><td><span className="status-pill in-stock">{member.status}</span></td><td><span className="role-access">{member.role === 'Manager' ? 'Full access' : 'POS & reports'}</span></td><td><button className="icon-button row-action" aria-label={`Remove ${member.name}`} onClick={() => { setStaff((items) => items.filter((_, i) => i !== index)); addAudit(`Removed staff member ${member.name}`) }}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div></section><div className="note-banner"><ShieldCheck size={16} /><span>Staff accounts in this demo are local only. Connect an authentication provider before using this app in a live store.</span></div></>}

        {view === 'activity' && <><PageTitle eyebrow="SEPARATE OPERATIONAL HISTORY" title="Activity log" subtitle="Staff actions and inventory movements are separate from customer sales." /><div className="dashboard-grid"><section className="content-panel"><div className="panel-heading"><div><h2>Staff & store audit</h2><span>Sign-ins, menu edits, and admin actions.</span></div></div><AuditList audit={audit} /></section><section className="content-panel"><div className="panel-heading"><div><h2>Inventory movements</h2><span>Stock changes and sale deductions.</span></div></div><StockMovementTable movements={stockMovements.slice(0, 12)} /></section></div><section className="content-panel table-panel recent-panel"><div className="panel-heading"><div><h2>Sales stay separate</h2><span>Customer purchases and receipts are maintained in the sales register.</span></div><button className="tiny-link" onClick={() => setView('orders')}>Open sales <ArrowRight size={13} /></button></div></section></>}

        {view === 'reports' && <><PageTitle eyebrow="NUMBERS WITH A LITTLE SPARKLE" title={role === 'Manager' ? 'Reports' : 'Shift closeout'} subtitle={role === 'Manager' ? 'A clearer look at how your shop is doing.' : 'Your completed sales for this shift.'} action={<button className="outline-button" onClick={() => window.print()}><Printer size={16} /> Print report</button>} /><div className="report-filter">{(['daily', 'weekly', 'monthly'] as const).filter((range) => role === 'Manager' || range === 'daily').map((range) => <button className={`filter-chip${reportRange === range ? ' selected' : ''}`} key={range} onClick={() => setReportRange(range)}>{range.charAt(0).toUpperCase() + range.slice(1)}</button>)}<span>{role === 'Manager' ? `All-time transactions: ${visibleTransactions.filter((transaction) => transaction.status !== 'Pending' && transaction.status !== 'Declined').length}` : `Your transactions: ${visibleTransactions.length}`}</span></div><div className="metric-grid"><Metric label={role === 'Manager' ? 'Gross sales' : 'Your cash out'} value={money(periodSales)} change={`${reportRange} · before discounts`} icon={Wallet} tone="green" />{role === 'Manager' && <Metric label="Discounts given" value={money(periodTransactions.reduce((sum, item) => sum + item.discount, 0))} change={`Across ${reportRange} period`} icon={Tag} tone="gold" />}<Metric label="Completed orders" value={String(periodTransactions.length)} change={`Across ${reportRange} period`} icon={ShoppingBag} tone="pink" /><Metric label="Avg. order value" value={money(periodTransactions.length ? periodSales / periodTransactions.length : 0)} change={`Across ${reportRange} period`} icon={BarChart3} tone="brown" /></div>{role === 'Manager' ? <><section className="content-panel sales-panel report-chart"><div className="panel-heading"><div><h2>Revenue trend</h2><span>Sales from the last 7 days</span></div></div><SalesChart transactions={transactions.filter((transaction) => transaction.status !== 'Pending' && transaction.status !== 'Declined')} now={now} /></section><section className="content-panel table-panel"><div className="panel-heading"><div><h2>Product performance</h2><span>Best-selling drinks from recorded orders</span></div></div><TopProducts transactions={periodTransactions} /></section></> : <section className="content-panel table-panel"><div className="panel-heading"><div><h2>Your completed sales</h2><span>Transactions linked to your cashier account.</span></div></div><TransactionTable transactions={periodTransactions} onReceipt={setReceipt} /></section>}</>}

        {view === 'settings' && <><PageTitle eyebrow="THE LITTLE DETAILS" title="Store settings" subtitle="Make this space feel like your shop." /><section className="content-panel settings-panel"><div className="settings-section"><div><h2>Store profile</h2><span>What customers see on their receipt.</span></div><div className="settings-fields"><label>Store name<input defaultValue="Shots & Sparkles" /></label><label>Social handle<input defaultValue="@shotsandsparkles" /></label><label>Contact number<input defaultValue="[redacted-phone]" /></label><button className="primary-button" onClick={() => notify('Store profile saved.')}>Save changes <Check size={15} /></button></div></div><div className="settings-section"><div><h2>Sales & tax</h2><span>Tax is calculated on each order.</span></div><div className="setting-toggle"><span><b>VAT</b><small>12% tax applied at checkout.</small></span><span className="toggle enabled">ON</span></div></div><div className="settings-section"><div><h2>Session security</h2><span>Automatic sign-out for inactive sessions.</span></div><div className="setting-toggle"><span><b>Session timeout</b><small>Automatically signs out after 30 minutes.</small></span><span className="toggle enabled">ON</span></div></div><div className="settings-section"><div><h2>Audit log</h2><span>Recent changes made in this store.</span></div><AuditList audit={audit} /></div><div className="note-banner"><ShieldCheck size={16} /><span>This client-only demo stores records in this browser. For real authentication, staff controls, and secure backups, connect a server before opening your store.</span></div></section></>}
      </div>
    </main>

    {modal === 'product' && selected && <div className="overlay" onClick={() => setModal(null)}><div className="dialog customize-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className={`customize-art color-${selected.category}`}><div className="drink-illustration"><span className="drink-lid" /><span className="drink-straw" /><span className="drink-liquid" /><span className="drink-label">S<span>&</span>S</span></div></span><div className="customize-heading"><span className="eyebrow">{categoriesLabels[selected.category]}</span><h2>{selected.name}</h2><p>Make it just the way you like it.</p></div><div className="option-block"><div className="option-title"><b>Choose your size</b><span>Required</span></div><div className="variant-options">{selected.variants.map((variant, index) => <button className={variantIndex === index ? 'picked' : ''} key={variant.name} onClick={() => setVariantIndex(index)}><span>{variant.name}</span><b>{money(variant.price + addons.length * 10)}</b></button>)}</div></div>{selected.category !== 'dessert' && <><div className="option-block"><div className="option-title"><b>Sugar level</b><span>{sugar}</span></div><div className="sugar-options">{['0%', '25%', '50%', '75%', '100%'].map((level) => <button className={sugar === level ? 'picked' : ''} key={level} onClick={() => setSugar(level)}>{level}</button>)}</div></div><div className="option-block"><div className="option-title"><b>A little extra</b><span>₱10 each</span></div><div className="addon-options">{['Extra shot', 'Cream'].map((addon) => <button className={addons.includes(addon) ? 'picked' : ''} key={addon} onClick={() => setAddons((items) => items.includes(addon) ? items.filter((item) => item !== addon) : [...items, addon])}><span className="checkbox">{addons.includes(addon) && <Check size={12} />}</span>{addon}</button>)}</div></div></>}<button className="checkout-button add-button" onClick={addToCart}><span><Plus size={17} /> Add to order</span><b>{money(selected.variants[variantIndex].price + addons.length * 10)}</b></button></div></div>}

    {modal === 'payment' && role === 'Buyer' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog payment-dialog buyer-checkout-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">A FEW LITTLE DETAILS</span><h2>Finish your order</h2><p className="dialog-description">Choose how you’ll enjoy your order and how you’ll pay.</p><div className="payment-total"><span>Total</span><b>{money(total)}</b></div><span className="form-label">How would you like your order?</span><div className="payment-methods">{(['Dine in', 'Delivery'] as const).map((fulfillment) => <button type="button" className={buyerFulfillment === fulfillment ? 'selected' : ''} onClick={() => setBuyerFulfillment(fulfillment)} key={fulfillment}>{fulfillment === 'Dine in' ? <Coffee size={17} /> : <MapPin size={17} />}{fulfillment}</button>)}</div>{buyerFulfillment === 'Delivery' && <label className="form-label">Delivery address<input autoComplete="street-address" value={buyerDeliveryAddress} onChange={(event) => setBuyerDeliveryAddress(event.target.value)} placeholder="Street, barangay, city" required minLength={8} /></label>}<span className="form-label">Payment method</span><div className="payment-methods">{(['Cash', 'GCash'] as const).map((method) => <button type="button" className={buyerPaymentMethod === method ? 'selected' : ''} onClick={() => setBuyerPaymentMethod(method)} key={method}>{method === 'Cash' ? <BanknoteIcon /> : <Wallet size={17} />}{method}</button>)}</div>{buyerPaymentMethod === 'GCash' && <><div className="gcash-payment"><QRCodeSVG className="gcash-qr-code" value={gcashNumber} size={180} level="H" includeMargin /><span>Send payment to GCash {gcashNumber}, then enter your reference number.</span></div><label className="form-label">GCash reference number<input value={buyerGcashReference} onChange={(event) => setBuyerGcashReference(event.target.value)} placeholder="Enter the reference number" required minLength={4} /></label></>}<button className="checkout-button complete-button" onClick={submitBuyerOrder}><span><Check size={17} /> Place order</span><b>{money(total)}</b></button></div></div>}
    {modal === 'payment' && role !== 'Buyer' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog payment-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">ALMOST THERE</span><h2>Take payment</h2><p className="dialog-description">A lovely order, coming right up.</p><div className="payment-total"><span>Total due</span><b>{money(total)}</b></div><div className="payment-methods">{(['Cash', 'GCash'] as const).map((method) => <button className={payment === method ? 'selected' : ''} onClick={() => setPayment(method)} key={method}>{method === 'Cash' ? <BanknoteIcon /> : <Wallet size={17} />}{method}</button>)}</div>{payment === 'Cash' ? <><label className="form-label">Cash received<input type="number" min={total} placeholder="Enter amount in ₱" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} /></label><div className="change-line"><span>Change</span><b>{money(Math.max(0, Number(cashReceived || 0) - total))}</b></div><div className="quick-cash">{[Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter((amount, index, list) => list.indexOf(amount) === index).map((amount) => <button key={amount} onClick={() => setCashReceived(String(amount))}>{money(amount)}</button>)}</div></> : <div className="gcash-payment"><QRCodeSVG className="gcash-qr-code" value={gcashNumber} size={240} level="H" includeMargin /></div>}<button className="checkout-button complete-button" onClick={completeSale}><span><Check size={17} /> Complete sale</span><b>{money(total)}</b></button></div></div>}

    {modal === 'discount' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">A LITTLE SOMETHING EXTRA</span><h2>Apply a discount</h2><p className="dialog-description">Senior and PWD discounts, promo codes, or a custom amount.</p><div className="discount-presets"><button onClick={() => { setDiscount(Math.round(subtotal * 0.2 * 100) / 100); setModal(null) }}>Senior / PWD · 20%<ArrowRight size={15} /></button></div><label className="form-label">Custom discount in PHP<input type="number" min="0" max={subtotal} value={customDiscount} onChange={(event) => setCustomDiscount(event.target.value)} placeholder="Enter amount" /></label><button className="outline-button full-width" onClick={() => { const amount = Number(customDiscount); if (amount > 0) { setDiscount(Math.min(amount, subtotal)); setCustomDiscount(''); setModal(null) } else notify('Enter a valid discount amount.') }}>Apply custom amount</button><label className="form-label">Promo code<input placeholder="e.g. SPARKLE10" value={promo} onChange={(event) => setPromo(event.target.value.toUpperCase())} /></label><button className="primary-button full-width" onClick={() => { if (promo === 'SPARKLE10') { setDiscount(Math.round(subtotal * 0.1 * 100) / 100); setModal(null) } else notify('That promo code is not valid.') }}>Apply promo</button></div></div>}

    {modal === 'new-product' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">MENU EDITOR</span><h2>Add product</h2><p className="dialog-description">Add a new item to your menu.</p><label className="form-label">Product name<input value={newProductName} onChange={(event) => setNewProductName(event.target.value)} placeholder="e.g. Brown Sugar Latte" /></label><label className="form-label">Category<select value={newProductCategory} onChange={(event) => setNewProductCategory(event.target.value as CategoryId)}>{categories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="form-label">Price in PHP<input type="number" min="1" value={newProductPrice} onChange={(event) => setNewProductPrice(event.target.value)} /></label><ImagePicker value={newProductImage} onChange={setNewProductImage} /><button className="primary-button full-width" onClick={createProduct}>Add product <Plus size={15} /></button></div></div>}

    {modal === 'staff' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">GROWING THE TEAM</span><h2>Add team member</h2><p className="dialog-description">Assign a store role to this team member.</p><label className="form-label">Full name<input placeholder="e.g. Jamie Cruz" value={newStaffName} onChange={(event) => setNewStaffName(event.target.value)} /></label><label className="form-label">Role<select value={newStaffRole} onChange={(event) => setNewStaffRole(event.target.value as Role)}><option>Cashier</option><option>Manager</option></select></label><button className="primary-button full-width" onClick={addTeamMember}>Add team member <Plus size={15} /></button></div></div>}

    {modal === 'stock' && <div className="overlay" onClick={() => setModal(null)}><div className="dialog compact-dialog" onClick={(event) => event.stopPropagation()}><button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">{stockEdit ? 'STOCK ADJUSTMENT' : 'NEW SUPPLY'}</span><h2>{stockEdit ? 'Update stock' : 'Add stock item'}</h2><StockForm item={stockEdit} onSave={(item) => { const oldItem = stockEdit ? stock.find((entry) => entry.id === item.id) : undefined; setStock((items) => stockEdit ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item]); appendStockMovement(item, item.quantity - (oldItem?.quantity || 0), stockEdit ? 'Adjustment' : 'Restock'); addAudit(`${stockEdit ? 'Updated stock for' : 'Added stock item'} ${item.name}`); setModal(null) }} /></div></div>}

    {modal === 'customer' && <CustomerForm customer={customerEdit} onClose={() => { setCustomerEdit(null); setModal(null) }} onSave={saveCustomer} />}

    {receipt && <div className="overlay receipt-overlay" onClick={() => setReceipt(null)}><div className="dialog receipt-dialog" onClick={(event) => event.stopPropagation()}><div className="receipt-actions"><button className="icon-button" aria-label="Close receipt" onClick={() => setReceipt(null)}><X size={18} /></button></div><div className="receipt-paper"><LogoMark compact /><span className="receipt-caption">SAN ISIDRO · MAIN STORE</span><div className="receipt-divider" /><div className="receipt-id"><span>RECEIPT</span><b>{receipt.id}</b></div><div className="receipt-meta"><span>{new Date(receipt.date).toLocaleString()}</span><span>Cashier: {receipt.cashier}</span>{receipt.customerName && <span>Customer: {receipt.customerName}</span>}</div><div className="receipt-divider" />{receipt.items.map((item, index) => <div className="receipt-item" key={`${item.key}-${index}`}><div><b>{item.name}</b><span>{item.quantity} × {item.variant} · {item.sugar} sugar</span></div><strong>{money(item.price * item.quantity)}</strong></div>)}<div className="receipt-divider" /><div className="receipt-breakdown"><span>Subtotal <b>{money(receipt.items.reduce((sum, item) => sum + item.price * item.quantity, 0))}</b></span><span>VAT 12% <b>{money(receipt.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 0.12)}</b></span>{receipt.discount > 0 && <span>Discount <b>−{money(receipt.discount)}</b></span>}</div><div className="receipt-total"><span>Total</span><b>{money(receipt.total)}</b></div><div className="receipt-meta"><span>Payment · {receipt.method}</span>{receipt.reference && <span>Reference · {receipt.reference}</span>}</div><div className="receipt-thanks">MADE WITH LOVE, JUST FOR YOU <Sparkles size={13} /></div></div><button className="primary-button receipt-print" onClick={() => window.print()}><Printer size={16} /> Print receipt</button></div></div>}
    {notification && <div className="toast"><Check size={15} /> {notification}</div>}
  </div>
}

function BuyerProfilePage({ name, phone, email, address, photo, orderCount, completedCount, pendingCount, totalSpent, onNameChange, onPhoneChange, onEmailChange, onAddressChange, onPhotoChange, onSave, onOrders, onShop, onSignOut }: {
  name: string
  phone: string
  email: string
  address: string
  photo: string
  orderCount: number
  completedCount: number
  pendingCount: number
  totalSpent: number
  onNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onEmailChange: (value: string) => void
  onAddressChange: (value: string) => void
  onPhotoChange: (value: string) => void
  onSave: (event: React.FormEvent<HTMLFormElement>) => void
  onOrders: () => void
  onShop: () => void
  onSignOut: () => void
}) {
  const completedFields = [name.trim(), phone.trim(), email.trim(), address.trim()].filter(Boolean).length
  return <div className="buyer-profile-page">
    <div className="buyer-profile-page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>Your profile</h1><p>Your details and order activity, all in one place.</p></div><div className="buyer-profile-actions"><button type="button" className="buyer-outline-button buyer-profile-signout" onClick={onSignOut}><LogOut size={15} /> Sign out</button><button type="button" className="buyer-outline-button" onClick={onShop}><ShoppingBag size={15} /> Browse the menu</button></div></div>
    <section className="buyer-profile-banner">
      <ProfilePhotoEditor name={name} photo={photo} onChange={onPhotoChange} />
      <div className="buyer-profile-banner-copy"><span>WELCOME BACK</span><h2>{name || 'Your name'}</h2><p>{email || 'Add an email address to complete your profile'}</p></div>
      <div className="buyer-profile-completion"><span>PROFILE DETAILS</span><strong>{completedFields}/4</strong><div><i style={{ width: `${completedFields * 25}%` }} /></div><small>{completedFields === 4 ? 'All details added' : 'Add details to complete your profile'}</small></div>
    </section>
    <div className="buyer-profile-layout">
      <section className="buyer-profile-card">
        <div className="buyer-profile-card-heading"><div><span className="eyebrow">PERSONAL INFORMATION</span><h2>Contact details</h2><p>Keep these details current so the shop can reach you about an order.</p></div><UserRound size={20} /></div>
        <form className="buyer-profile-form" onSubmit={onSave}>
          <label className="buyer-profile-field"><span>Full name <b>Required</b></span><div><UserRound size={16} /><input autoComplete="name" value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Your full name" required minLength={2} /></div></label>
          <label className="buyer-profile-field"><span>Mobile number <small>Optional</small></span><div><Phone size={16} /><input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => onPhoneChange(event.target.value)} placeholder="09xx xxx xxxx" /></div></label>
          <label className="buyer-profile-field"><span>Email address <small>Optional</small></span><div><Mail size={16} /><input type="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" /></div></label>
          <label className="buyer-profile-field"><span>Home address <small>Optional</small></span><div className="buyer-profile-address"><MapPin size={16} /><textarea autoComplete="street-address" rows={3} value={address} onChange={(event) => onAddressChange(event.target.value)} placeholder="Street, barangay, city" /></div></label>
          <div className="buyer-profile-form-footer"><span><ShieldCheck size={14} /> Your information is saved on this device.</span><button className="buyer-place-order" type="submit"><Check size={15} /> Save changes</button></div>
        </form>
      </section>
      <aside className="buyer-profile-side">
        <section className="buyer-profile-card buyer-activity-card"><div className="buyer-profile-card-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Order overview</h2></div><ShoppingBag size={20} /></div><div className="buyer-activity-metrics"><div><span>Total orders</span><b>{orderCount}</b></div><div><span>Accepted</span><b>{completedCount}</b></div><div><span>Waiting for response</span><b>{pendingCount}</b></div></div><div className="buyer-spent-total"><span>Total spent on accepted orders</span><strong>{money(totalSpent)}</strong></div><button className="buyer-profile-link" onClick={onOrders}>View order history <ArrowRight size={14} /></button></section>
        <section className="buyer-profile-tip"><Sparkles size={17} /><div><b>A little tip</b><span>Add your phone number so the team can reach you if they have a question about your order.</span></div></section>
      </aside>
    </div>
  </div>
}

function ProfilePhotoEditor({ name, photo, onChange }: { name: string; photo: string; onChange: (value: string) => void }) {
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [failedPhoto, setFailedPhoto] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const handleFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Choose an image file.')
    if (file.size > 8 * 1024 * 1024) return setError('Choose a photo under 8 MB.')

    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return setError('Photo editing is unavailable in this browser.')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        onChange(canvas.toDataURL('image/jpeg', 0.82))
        setError('')
      }
      image.onerror = () => setError('This photo could not be opened.')
      image.src = String(reader.result)
    }
    reader.onerror = () => setError('Unable to read this photo.')
    reader.readAsDataURL(file)
  }

  return <div className="buyer-photo-editor">
    <button type="button" className="buyer-profile-avatar" aria-label="Profile photo options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
      {photo && failedPhoto !== photo ? <img src={photo} alt="" onError={() => setFailedPhoto(photo)} /> : (name.charAt(0) || '?').toUpperCase()}
      <span className="buyer-photo-change" aria-hidden="true"><Camera size={14} /></span>
    </button>
    {menuOpen && <div className="buyer-photo-menu" role="menu" aria-label="Profile photo options">
      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); fileInput.current?.click() }}><Camera size={14} /> Change photo</button>
      <button type="button" role="menuitem" disabled={!photo} onClick={() => { onChange(''); setError(''); setMenuOpen(false) }}><Trash2 size={14} /> Remove photo</button>
    </div>}
    <input ref={fileInput} className="buyer-photo-input" type="file" accept="image/*" aria-label="Choose profile photo" onChange={(event) => { handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
    {error && <span className="buyer-photo-error" role="alert">{error}</span>}
  </div>
}

function BuyerStore({ products, category, search, cart, subtotal, tax, total, connectionNotice, onCategoryChange, onSearchChange, onStartOrder, onQuantityChange, onClearCart, onSubmitOrder, onViewOrders, onViewCart }: {
  products: Product[]
  category: CategoryId | 'all'
  search: string
  cart: CartItem[]
  subtotal: number
  tax: number
  total: number
  connectionNotice: string
  onCategoryChange: (category: CategoryId | 'all') => void
  onSearchChange: (search: string) => void
  onStartOrder: (product: Product) => void
  onQuantityChange: (key: string, amount: number) => void
  onClearCart: () => void
  onSubmitOrder: () => void
  onViewOrders: () => void
  onViewCart: () => void
}) {
  const cartCount = cart.reduce((quantity, item) => quantity + item.quantity, 0)
  return <div className="buyer-store">
    {connectionNotice && <div className="buyer-connection-notice"><Cloud size={15} /><span>{connectionNotice}</span></div>}
    <section className="buyer-hero">
      <div className="buyer-hero-copy"><span className="eyebrow">A LITTLE JOY, MADE FRESH</span><h1>Your next favorite<br /><em>is waiting.</em></h1><p>Handcrafted sips and sweet treats, made just the way you love them.</p><button className="buyer-hero-button" onClick={() => document.getElementById('buyer-menu')?.scrollIntoView({ behavior: 'smooth' })}>Explore the menu <ArrowRight size={16} /></button></div>
      <div className="buyer-hero-art" aria-hidden="true"><div className="buyer-art-sun" /><div className="buyer-art-cup"><span /><i /><b>S<span>&</span>S</b></div><div className="buyer-art-orbit">✦ <span>made with love</span> ✦</div><div className="buyer-art-leaf">✳</div></div>
      <div className="buyer-hero-note"><Sparkles size={14} /> Your neighborhood sip stop</div>
    </section>
    <div className="buyer-menu-layout" id="buyer-menu">
      <section className="buyer-menu-section">
        <div className="buyer-section-heading"><div><span className="eyebrow">PICK YOUR HAPPY</span><h2>Made for your moment.</h2><p>Choose a favorite. We’ll make it fresh when you order.</p></div><label className="buyer-search"><Search size={17} /><input placeholder="Find your favorite..." value={search} onChange={(event) => onSearchChange(event.target.value)} /><button type="button" aria-label="Clear menu search" onClick={() => onSearchChange('')} disabled={!search}><X size={14} /></button></label></div>
        <div className="buyer-category-tabs" aria-label="Filter menu by category"><button className={category === 'all' ? 'selected' : ''} aria-pressed={category === 'all'} onClick={() => onCategoryChange('all')}>Everything</button>{categories.map((item) => <button key={item.id} className={category === item.id ? 'selected' : ''} aria-pressed={category === item.id} onClick={() => onCategoryChange(item.id)}>{item.shortLabel}</button>)}</div>
        <div className="buyer-results-summary"><span>{products.length} {products.length === 1 ? 'treat' : 'treats'} to choose from</span>{(search || category !== 'all') && <button onClick={() => { onSearchChange(''); onCategoryChange('all') }}>Clear filters <X size={12} /></button>}</div>
        <div className="buyer-product-grid">{products.map((product) => <article className={`buyer-product-card color-${product.category}`} key={product.id}>
          <button className="buyer-product-art" onClick={() => onStartOrder(product)} aria-label={`Customize ${product.name}`}>
            {product.imageData ? <img src={product.imageData} alt="" /> : <div className="drink-illustration"><span className="drink-lid" /><span className="drink-straw" /><span className="drink-liquid" /><span className="drink-label">S<span>&</span>S</span></div>}
            <span className="buyer-card-sparkle">✦</span>
          </button>
          <div className="buyer-product-info"><span>{categoriesLabels[product.category]}</span><h3>{product.name}</h3><div><b>From {money(Math.min(...product.variants.map((variant) => variant.price)))}</b><button onClick={() => onStartOrder(product)} aria-label={`Add ${product.name}`}><Plus size={17} /></button></div></div>
        </article>)}</div>
        {!products.length && <div className="buyer-empty"><Search size={22} /><b>No matches just yet</b><span>Try another flavor or clear your filters to see everything.</span><button onClick={() => { onSearchChange(''); onCategoryChange('all') }}>Show all menu items</button></div>}
      </section>
      <aside className="buyer-cart-card" id="buyer-cart">
        <div className="buyer-cart-heading"><div><span className="eyebrow">YOUR LITTLE LINEUP</span><h2>Your bag <span>{cart.reduce((quantity, item) => quantity + item.quantity, 0)}</span></h2></div><ShoppingBag size={21} /></div>
        {cart.length ? <><div className="buyer-cart-items">{cart.map((item) => <div className="buyer-cart-item" key={item.key}><div className={`buyer-cart-thumb color-${item.category}`}>{item.imageData ? <img src={item.imageData} alt="" /> : <Coffee size={18} />}</div><div className="buyer-cart-detail"><b>{item.name}</b><span>{item.variant} · {item.sugar} sugar{item.addons.length ? ` · ${item.addons.join(', ')}` : ''}</span><strong>{money(item.price * item.quantity)}</strong><div className="buyer-quantity"><button onClick={() => onQuantityChange(item.key, -1)} aria-label="Remove one"><Minus size={12} /></button><span>{item.quantity}</span><button onClick={() => onQuantityChange(item.key, 1)} aria-label="Add one"><Plus size={12} /></button></div></div></div>)}</div>
          <button className="buyer-clear" onClick={onClearCart}>Clear bag</button><div className="buyer-total-lines"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>VAT <small>12%</small></span><b>{money(tax)}</b></div><div className="buyer-total"><span>Total</span><strong>{money(total)}</strong></div></div><button className="buyer-place-order" onClick={onSubmitOrder}><span>Place my order <ArrowRight size={17} /></span><b>{money(total)}</b></button><p className="buyer-pay-note"><ShieldCheck size={14} /> Choose dine-in or delivery and payment at checkout.</p>
        </> : <div className="buyer-cart-empty"><div><ShoppingBag size={23} /></div><b>Something lovely starts here.</b><span>Add a drink or treat to your bag.</span><button onClick={onViewOrders}>Track my orders <ArrowRight size={14} /></button></div>}
      </aside>
    </div>
    {cartCount > 0 && <button className="buyer-mobile-cart" onClick={onViewCart}><span><ShoppingBag size={17} /> View bag <b>{cartCount}</b></span><strong>{money(total)} <ArrowRight size={15} /></strong></button>}
    <footer className="buyer-footer"><span>Made with love, just for you <Sparkles size={13} /></span><button onClick={onViewOrders}>Already ordered? Track it <ArrowRight size={14} /></button></footer>
  </div>
}

function BuyerOrderHistory({ orders, onShop }: { orders: Transaction[]; onShop: () => void }) {
  const [filter, setFilter] = useState<'all' | 'Pending' | 'Accepted' | 'Declined'>('all')
  const orderStatus = (order: Transaction) => order.status || 'Accepted'
  const filteredOrders = orders.filter((order) => filter === 'all' || orderStatus(order) === filter)
  const filterOptions: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all', label: 'All orders', count: orders.length },
    { id: 'Pending', label: 'Waiting', count: orders.filter((order) => orderStatus(order) === 'Pending').length },
    { id: 'Accepted', label: 'Accepted', count: orders.filter((order) => orderStatus(order) === 'Accepted').length },
    { id: 'Declined', label: 'Declined', count: orders.filter((order) => orderStatus(order) === 'Declined').length },
  ]
  return <div className="buyer-history">
    <div className="buyer-history-heading"><div><span className="eyebrow">YOUR LITTLE JOY TRACKER</span><h1>My orders</h1><p>We’ll keep you posted as your order is prepared.</p></div><button className="buyer-outline-button" onClick={onShop}><ArrowRight size={15} /> Back to menu</button></div>
    {orders.length > 0 && <div className="buyer-order-filters" aria-label="Filter order history">{filterOptions.filter((option) => option.id === 'all' || option.count > 0).map((option) => <button key={option.id} className={filter === option.id ? 'selected' : ''} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}<span>{option.count}</span></button>)}</div>}
    {filteredOrders.length ? <div className="buyer-order-list">{filteredOrders.map((order) => {
      const status = orderStatus(order)
      const itemCount = order.items.reduce((quantity, item) => quantity + item.quantity, 0)
      return <article className="buyer-order-card" key={order.id}>
        <div className="buyer-order-card-top"><div><span className="eyebrow">ORDER {order.id}</span><small>{new Date(order.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></div><span className={`buyer-status status-${status.toLowerCase()}`}>{status === 'Pending' && <i />}{status === 'Accepted' && <Check size={13} />}{status === 'Declined' && <X size={13} />}{status === 'Pending' ? 'Waiting for the shop' : status === 'Accepted' ? 'Accepted' : 'Not accepted'}</span></div>
        <div className="buyer-order-items">{order.items.map((item, index) => <div key={`${order.id}-${index}`}><span>{item.quantity} × {item.name} <small>{item.variant}</small></span><b>{money(item.price * item.quantity)}</b></div>)}</div>
        <div className="buyer-order-card-bottom"><span>{order.fulfillmentType || 'Dine in'} · {order.method} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</span><strong>{money(order.total)}</strong></div>
        {order.reference && <div className="buyer-order-message"><CreditCard size={14} /> GCash reference: {order.reference}</div>}
        {order.customerAddress && <div className="buyer-order-message"><MapPin size={14} /> Delivery to: {order.customerAddress}</div>}
        {status === 'Pending' && <div className="buyer-order-message"><Clock3 size={15} /> Your order is with the shop. Check back soon for an update.</div>}
        {status === 'Accepted' && <div className="buyer-order-message accepted"><Sparkles size={15} /> It’s a yes! The team is getting your order ready.</div>}
        {status === 'Declined' && <div className="buyer-order-message declined"><CircleHelp size={15} /> The shop couldn’t accept this order. Please contact the team or try again.</div>}
      </article>
    })}</div> : orders.length ? <div className="buyer-history-empty"><div><Search size={24} /></div><h2>No {filter.toLowerCase()} orders</h2><p>Try another status to see more of your order history.</p><button className="buyer-place-order" onClick={() => setFilter('all')}>Show all orders <ArrowRight size={16} /></button></div> : <div className="buyer-history-empty"><div><ShoppingBag size={25} /></div><h2>No orders just yet</h2><p>Your next favorite drink is only a few taps away.</p><button className="buyer-place-order" onClick={onShop}>Explore the menu <ArrowRight size={16} /></button></div>}
  </div>
}

function BanknoteIcon() { return <Wallet size={17} /> }
function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div> }
function Metric({ label, value, change, icon: Icon, tone }: { label: string; value: string; change: string; icon: typeof Wallet; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{change}</small></div> }
function SalesChart({ transactions, now }: { transactions: Transaction[]; now: Date }) {
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(now); day.setDate(day.getDate() - (6 - index)); return day })
  const values = days.map((day) => transactions.filter((item) => sameLocalDay(item.date, day)).reduce((sum, item) => sum + item.total, 0))
  const max = Math.max(...values, 500)
  return <div className="sales-chart"><div className="chart-guides"><span>₱{Math.ceil(max / 100) * 100}</span><span>₱{Math.ceil(max / 200) * 100}</span><span>₱0</span></div><div className="chart-columns">{days.map((day, index) => <div className="chart-column" key={day.toDateString()}><div className="bar-track"><div className={`chart-bar${index === 6 ? ' today' : ''}`} style={{ height: `${Math.max(values[index] ? values[index] / max * 100 : 3, 3)}%` }} title={money(values[index])} /></div><span>{day.toLocaleDateString('en', { weekday: 'short' })}</span></div>)}</div></div>
}
function TopProducts({ transactions }: { transactions: Transaction[] }) {
  const counts = new Map<string, { quantity: number; name: string; category: CategoryId }>()
  transactions.forEach((transaction) => transaction.items.forEach((item) => { const current = counts.get(item.productId); counts.set(item.productId, { name: item.name, category: item.category, quantity: (current?.quantity || 0) + item.quantity }) }))
  const top = [...counts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5)
  return top.length ? <div className="top-products">{top.map((item, index) => <div className="top-product" key={item.name}><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><span className={`top-product-icon color-${item.category}`}><Coffee size={16} /></span><span><b>{item.name}</b><small>{categoriesLabels[item.category]}</small></span><strong>{item.quantity} sold</strong></div>)}</div> : <div className="empty-table"><ShoppingBag size={20} /><span>Completed orders will show your top picks.</span></div>
}
function TransactionTable({ transactions, onReceipt }: { transactions: Transaction[]; onReceipt: (transaction: Transaction) => void }) { return <div className="table-scroll"><table><thead><tr><th>ORDER</th><th>DATE & TIME</th><th>CUSTOMER</th><th>CHANNEL</th><th>ITEMS</th><th>PAYMENT</th><th>STATUS</th><th>TOTAL</th><th></th></tr></thead><tbody>{transactions.length ? transactions.map((transaction) => { const status = transaction.status || 'Accepted'; return <tr key={transaction.id}><td><b className="receipt-cell">{transaction.id}</b></td><td>{new Date(transaction.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{transaction.customerName || 'Walk-in'}</td><td>{transaction.source === 'buyer' ? 'Online' : transaction.cashier}</td><td>{transaction.items.reduce((sum, item) => sum + item.quantity, 0)} items</td><td><span className="payment-pill">{transaction.method}</span></td><td><span className={`order-status-pill status-${status.toLowerCase()}`}>{status}</span></td><td><b>{money(transaction.total)}</b></td><td>{status === 'Accepted' && <button className="icon-button row-action" onClick={() => onReceipt(transaction)} aria-label={`Reprint ${transaction.id}`}><Printer size={15} /></button>}</td></tr> }) : <tr><td colSpan={9}><div className="empty-table"><FileText size={20} /><span>No sales recorded in this view yet.</span></div></td></tr>}</tbody></table></div> }
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