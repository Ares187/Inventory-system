import { getSupabaseAdmin } from "../supabase-admin";

export const LOCALLY_STORE_IDS = [1, 2, 3];

export type LocallyStore = {
  id: number;
  name: string;
  locally_location_id: string | null;
};

type Product = {
  id: number;
  brand: string;
  model: string;
  size: string;
  width: string;
  color: string;
  upc: string | null;
  retail_price: number;
  active: boolean;
};

type InventoryRow = { store_id: number; product_id: number; quantity: number };

function validUpc(upc: string): boolean {
  if (!/^\d{12}$/.test(upc) || /^0+$/.test(upc)) return false;
  const sum = [...upc].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1),
    0
  );
  return sum % 10 === 0;
}

export function summarizeLocallyInventory(
  store: LocallyStore,
  inventory: InventoryRow[],
  products: Product[]
) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const activeUpcs = new Map<string, number>();
  for (const product of products) {
    const upc = product.upc?.trim() ?? "";
    if (product.active && validUpc(upc)) {
      activeUpcs.set(upc, (activeUpcs.get(upc) ?? 0) + 1);
    }
  }

  const rows: { upc: string; quantity: number; price: number }[] = [];
  const exclusions: { productId: number; name: string; reason: string }[] = [];
  let blockingExclusions = 0;

  for (const item of inventory) {
    const product = productById.get(item.product_id);
    const upc = product?.upc?.trim() ?? "";
    const price = Number(product?.retail_price);
    let reason: string | undefined;

    if (!product) reason = "Product not found";
    else if (!product.active) reason = "Inactive product";
    else if (!upc) reason = "Missing UPC";
    else if (!validUpc(upc)) reason = "Invalid UPC";
    else if ((activeUpcs.get(upc) ?? 0) > 1) reason = "Duplicate UPC across active variants";
    else if (!Number.isFinite(price) || price <= 0) reason = "Invalid price";
    else if (!Number.isSafeInteger(item.quantity) || item.quantity < 0) reason = "Invalid quantity";

    if (reason) {
      if (reason !== "Inactive product" && item.quantity !== 0) blockingExclusions++;
      exclusions.push({
        productId: item.product_id,
        name: product
          ? [product.brand, product.model, product.size, product.width, product.color].join(" ")
          : `Product ${item.product_id}`,
        reason,
      });
    } else {
      rows.push({ upc, quantity: item.quantity, price });
    }
  }

  rows.sort((a, b) => a.upc.localeCompare(b.upc));
  const csv = [
    "upc,qty,price",
    ...rows.map(({ upc, quantity, price }) => `"${upc}",${quantity},${price.toFixed(2)}`),
  ].join("\r\n") + "\r\n";

  return {
    store,
    csv,
    total: inventory.length,
    ready: rows.length,
    excluded: exclusions.length,
    zeroStock: rows.filter((row) => row.quantity === 0).length,
    blockingExclusions,
    exclusions,
  };
}

async function loadPages<T>(
  query: (start: number, end: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadLocallyStores(): Promise<LocallyStore[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("id,name,locally_location_id")
    .in("id", LOCALLY_STORE_IDS)
    .eq("active", true)
    .order("id");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function locallyMappingIssue(store: LocallyStore, stores: LocallyStore[]): string | null {
  const location = store.locally_location_id?.trim();
  if (!location) return "Location ID missing";
  if (stores.some((other) => other.id !== store.id && other.locally_location_id?.trim() === location)) {
    return "Location ID used by multiple stores";
  }
  return null;
}

export async function generateLocallyExports(stores: LocallyStore[]) {
  if (!stores.length) return [];
  const db = getSupabaseAdmin();
  const [products, inventory] = await Promise.all([
    loadPages<Product>((start, end) => db.from("products")
      .select("id,brand,model,size,width,color,upc,retail_price,active")
      .order("id").range(start, end)),
    loadPages<InventoryRow>((start, end) => db.from("inventory")
      .select("store_id,product_id,quantity")
      .in("store_id", stores.map((store) => store.id))
      .order("store_id").order("product_id").range(start, end)),
  ]);
  return stores.map((store) =>
    summarizeLocallyInventory(store, inventory.filter((item) => item.store_id === store.id), products)
  );
}
