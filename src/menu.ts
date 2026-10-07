export type CategoryId = 'juice' | 'matcha' | 'soda' | 'coffee' | 'milky' | 'dessert'

export type MenuVariant = {
  name: string
  price: number
}

export type Product = {
  id: string
  name: string
  category: CategoryId
  variants: MenuVariant[]
  imageData?: string
  active: boolean
  archived: boolean
}

export const categories: { id: CategoryId; label: string; shortLabel: string }[] = [
  { id: 'juice', label: 'Juice Series', shortLabel: 'Juice' },
  { id: 'matcha', label: 'Matcha Series', shortLabel: 'Matcha' },
  { id: 'soda', label: 'Soda Sparkle Series', shortLabel: 'Soda' },
  { id: 'coffee', label: 'Coffee Shots Series', shortLabel: 'Coffee' },
  { id: 'milky', label: 'Milky Series', shortLabel: 'Milky' },
  { id: 'dessert', label: 'Desserts & Pastries', shortLabel: 'Desserts' },
]

const sizes = {
  classic: [
    { name: 'Small', price: 40 },
    { name: 'Medium', price: 60 },
    { name: 'Large', price: 80 },
  ],
  soda: [
    { name: 'Small', price: 35 },
    { name: 'Medium', price: 45 },
    { name: 'Large', price: 65 },
  ],
  milky: [
    { name: 'Small', price: 40 },
    { name: 'Medium', price: 60 },
    { name: 'Large', price: 80 },
  ],
}

const product = (id: string, name: string, category: CategoryId, variants: MenuVariant[]): Product => ({
  id,
  name,
  category,
  variants,
  active: true,
  archived: false,
})

export const initialProducts: Product[] = [
  product('juice-lemon-tea', 'Lemon Iced Tea', 'juice', [
    { name: 'Small', price: 39 },
    { name: 'Medium', price: 49 },
    { name: 'Large', price: 59 },
  ]),
  ...['Matcha Latte', 'Cafe Matcha', 'Ube Matcha', 'Oreo Matcha', 'Strawberry Matcha'].map((name) =>
    product(`matcha-${name.toLowerCase().replaceAll(' ', '-')}`, name, 'matcha', sizes.classic),
  ),
  ...[
    'Strawberry Soda', 'Blueberry Soda', 'BlueLychee Soda', 'StrawLychee Soda', 'Lychee Soda',
    'Green Apple Soda', 'Lemon Soda', 'Orange Soda', 'Grapes Soda', 'Peach Soda',
    'Mango Soda', 'Peach Mango Soda',
  ].map((name) => product(`soda-${name.toLowerCase().replaceAll(' ', '-')}`, name, 'soda', sizes.soda)),
  ...[
    'Caramel Macchiato', 'Salted Caramel', 'Vanilla', 'Mocha', 'Hazelnut', 'Choco Hazelnut',
    'Spanish Latte', 'Cafe Latte', 'Milo Coffee', 'Oreo Coffee', 'Milo - Oreo Coffee',
  ].map((name) => product(`coffee-${name.toLowerCase().replaceAll(' ', '-')}`, name, 'coffee', sizes.classic)),
  ...[
    'Milky Chocolate', 'Milky Blueberry', 'Milky Strawberry', 'Milky Oreo', 'Milky Milo',
    'Milo-Oreo Latte', 'Ube Latte', 'Mango Latte', 'Red Velvet Latte', 'Grapes Latte',
    'Milky Yogurt', 'Strawberry Yogurt', 'Blueberry Yogurt', 'Lemon Yogurt', 'Mango Yogurt', 'Grapes Yogurt',
  ].map((name) => product(`milky-${name.toLowerCase().replaceAll(' ', '-')}`, name, 'milky', sizes.milky)),
  product('dessert-moist-messy-cup', 'Moist Messy Cup', 'dessert', [{ name: 'Cup', price: 80 }]),
]

export const money = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)