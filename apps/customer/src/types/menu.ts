export type Category = {
  id: string;
  name: string;
  parent_id?: string | null;
};

export type ProductVariant = {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  is_default?: boolean;
  description?: string;
};

export type Modifier = {
  id: string;
  name: string;
  price: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  modifiers: Modifier[];
};

export type IngredientDisplay = {
  id: string;
  ingredient_id: string;
  is_essential: boolean;
  is_visible: boolean;
  ingredients: {
    id: string;
    name: string;
    sale_price?: number;
    cost_per_unit?: number;
  };
};

export type ProductExtra = {
  id: string;
  ingredient_id: string;
  is_active: boolean;
  ingredients: {
    id: string;
    name: string;
    sale_price?: number;
    cost_per_unit?: number;
  };
};

export type CartItem = {
  uid: string;
  variantId: string;
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  variant: ProductVariant;
  extras: Modifier[];
  allowHalf?: boolean;
  halves?: { first: string; second: string };
  removedIngredients?: string[];
  categories?: Category[];
};

export type Product = {
  id: string;
  name: string;
  description?: string;
  allow_half?: boolean;
  is_hero?: boolean;
  is_featured?: boolean;
  is_suggestable?: boolean;
  show_in_menu?: boolean;
  categories: Category[];
  product_variants: ProductVariant[];
  modifier_group_products?: { modifier_groups: ModifierGroup }[];
  product_ingredients_display?: IngredientDisplay[];
  product_extras?: ProductExtra[];
};

export type Branding = {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  instagram_url?: string;
  website_url?: string;
  web_open?: boolean;
  web_closed_message?: string;
  brand_color?: string;
  accent_color?: string;
  font_family?: string;
  font_url?: string;
  font_primary?: string;
  font_secondary?: string;
};

export type Combo = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category_id?: string;
  categories?: Category[];
  combo_products: Array<{
    id: string;
    product_id: string;
    quantity: number;
    products?: {
      id: string;
      name: string;
      product_variants: Array<{
        id: string;
        name: string;
        price: number;
        is_default: boolean;
      }>;
    };
  }>;
};

export type MenuPageClientProps = {
  initialMenu: Product[];
  initialCombos?: Combo[];
  branding?: Branding;
  branchSlug: string;
  customer?: {
    name?: string;
    phone: string;
  } | null;
};

export type ProductModalProps = {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
  branding?: Branding;
};
