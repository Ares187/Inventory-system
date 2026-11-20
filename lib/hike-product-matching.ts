
import {
  classifyHikeProduct,
  type HikeClassificationResult,
} from "./hike-classification";

type HikeVariant = {
  prod_variant_id?: number;
  sku?: string | null;
  barcode?: string | null;
  variant_name?: string | null;
  variant_sub_values?: Array<{
    variant_attribute_name?: string;
    variant_sub_value_name?: string;
  }>;
};

type HikeProduct = {
  id?: number;
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  product_type?: Array<{
    type_id?: number;
    type_name?: string;
  }>;
  product_variants?: HikeVariant[];
};

export type MatchedHikeProduct = {
  productId: number | null;
  variantId: number | null;
  name: string | null;
  sku: string | null;
  barcode: string | null;
  size: string | null;
  width: string | null;
  color: string | null;
  classification: HikeClassificationResult;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchHikeSku(
  sku: string,
  products: HikeProduct[]
): MatchedHikeProduct | null {
  const targetSku = normalize(sku);

  if (!targetSku) return null;

  for (const product of products) {
    const variants = product.product_variants ?? [];

    for (const variant of variants) {
      if (normalize(variant.sku) !== targetSku) continue;

      const attributes = variant.variant_sub_values ?? [];

      const attribute = (name: string) =>
        attributes.find(
          (item) =>
            normalize(item.variant_attribute_name) ===
            normalize(name)
        )?.variant_sub_value_name ?? null;

      return {
        productId: product.id ?? null,
        variantId: variant.prod_variant_id ?? null,
        name: variant.variant_name ?? product.name ?? null,
        sku: variant.sku ?? null,
        barcode: variant.barcode ?? null,
        size: attribute("size"),
        width: attribute("width"),
        color: attribute("color"),
        classification: classifyHikeProduct(product),
      };
    }

    if (normalize(product.sku) === targetSku) {
      return {
        productId: product.id ?? null,
        variantId: null,
        name: product.name ?? null,
        sku: product.sku ?? null,
        barcode: product.barcode ?? null,
        size: null,
        width: null,
        color: null,
        classification: classifyHikeProduct(product),
      };
    }
  }

  return null;
}
