export type Category = {
  id: string
  name: string
}

export type ProductVariant = {
  id: string
  name: string
  price: number
  image_url?: string
  is_default?: boolean
  description?: string
}

export type Modifier = {
  id: string
  name: string
  price: number
}

export type CartItem = {
  uid: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
};
export type ModifierGroupProduct = {
  modifier_groups: {
    modifiers: Modifier[]
  }[]
}

export type Product = {
  id: string
  name: string
  description?: string

  categories: Category[]   // 👈 IMPORTANTE

  product_variants: ProductVariant[]

  modifier_group_products?: ModifierGroupProduct[]
}

export type Branding = {
  logo_url?: string
  primary_color?: string
  secondary_color?: string
  background_color?: string
  instagram_url?: string
  website_url?: string
  web_open?: boolean
  web_closed_message?: string
}

/* Props del menu */

export type MenuPageClientProps = {
  initialMenu: Product[]
  branding?: Branding
  branchSlug: string // 👈 NUEVO
}

/* Props modal */

export type ProductModalProps = {
  open: boolean
  product: Product | null
  onClose: () => void
  onAddToCart: (item: any) => void
}

