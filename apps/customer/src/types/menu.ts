export type Category = {
  id: string;
  name: string;
  parent_id?: string | null;
  position?: number;
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
  itemType?: "product" | "combo";
  comboId?: string;
  name: string;
  price: number;
  quantity: number;
  variant: ProductVariant;
  extras: Modifier[];
  allowHalf?: boolean;
  halves?: { first: string; second: string };
  removedIngredients?: Array<{
    id: string;
    name: string;
    productId?: string;
    productName?: string;
  }>;
  categories?: Category[];
};

export type Product = {
  id: string;
  name: string;
  description?: string;
  itemType?: "product" | "combo";
  comboId?: string;
  featured_order?: number;
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
  [key: string]: any;
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
  web_closed_reason?: string;
  web_closed_until?: string;
  brand_color?: string;
  accent_color?: string;
  font_family?: string;
  font_url?: string;
  font_primary?: string;
  font_secondary?: string;
  favicon_url?: string;
  meta_title?: string;
  meta_pixel_id?: string;
  ga4_measurement_id?: string;
  meta_pixel_script?: string;
  ga4_script?: string;
};

export type Combo = {
  id: string;
  name: string;
  description?: string;
  price: number;
  is_featured?: boolean;
  featured_order?: number;
  image_url?: string;
  category_id?: string;
  categories?: Category[];
  product_extras?: ProductExtra[];
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
  combo_removable_ingredients?: Array<{
    id: string;
    product_id: string;
    ingredient_id: string;
    is_active: boolean;
    products?: {
      id: string;
      name: string;
    };
    ingredients?: {
      id: string;
      name: string;
    };
  }>;
};

export type MenuPageClientProps = {
  initialMenu: Product[];
  initialCombos?: Combo[];
  branding?: Branding;
  availability?: {
    isOpen: boolean;
    message: string;
    reason: "manual" | "temporary" | "hours" | null;
  };
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
