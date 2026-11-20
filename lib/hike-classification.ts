
export type HikeClassification =
  | "shoe"
  | "unresolved"
  | "ignored";

export type HikeClassificationResult = {
  classification: HikeClassification;
  reason: string;
};

type HikeProduct = {
  name?: string | null;
  product_type?: Array<{
    type_id?: number;
    type_name?: string;
  }> | null;
};

export function classifyHikeProduct(
  product: HikeProduct
): HikeClassificationResult {
  const name = (product.name ?? "").toLowerCase().trim();

  const categories = (product.product_type ?? [])
    .map((category) => category.type_name?.toLowerCase() ?? "");

  const categoryText = categories.join(" ");

  // Generic footwear requires employee identification.
  if (
    name.includes("general") &&
    (name.includes("footwear") || name.includes("shoes"))
  ) {
    return {
      classification: "unresolved",
      reason: "Generic footwear sale",
    };
  }

  // Recognized footwear categories.
  if (
    categoryText.includes("footwear") ||
    categoryText.includes("running shoes") ||
    categoryText.includes("track spikes") ||
    categoryText.includes("racing spikes")
  ) {
    return {
      classification: "shoe",
      reason: "Footwear category",
    };
  }

  // Clearly non-footwear categories.
  if (
    categoryText.includes("electronics") ||
    categoryText.includes("apparel") ||
    categoryText.includes("accessories") ||
    categoryText.includes("hydration") ||
    categoryText.includes("socks") ||
    categoryText.includes("insoles")
  ) {
    return {
      classification: "ignored",
      reason: "Non-footwear category",
    };
  }

  // Unknown categories should not be silently ignored.
  return {
    classification: "unresolved",
    reason: "Unrecognized product category",
  };
}
