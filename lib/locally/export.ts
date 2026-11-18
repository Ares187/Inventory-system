
import { getSupabaseAdmin } from "../supabase-admin";

type ExportRow = {
  upc: string;
  qty: number;
  price: number;
};

export type LocallyExportResult = {
  storeId: number;
  csv: string;
  productCount: number;
  excludedCount: number;
};

function isValidUpc(value: string | null): value is string {
  if (!value) return false;

  const normalized = value.trim();

  return /^[0-9]{12,14}$/.test(normalized);
}

function escapeCsv(value: string | number): string {
  const text = String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export async function generateLocallyExport(
  storeId: number
): Promise<LocallyExportResult> {
  const db = getSupabaseAdmin();

  const { data: store, error: storeError } = await db
    .from("stores")
    .select("id, active")
    .eq("id", storeId)
    .single();

  if (storeError || !store) {
    throw new Error("Store not found");
  }

  if (!store.active) {
    throw new Error("Cannot export an inactive store");
  }

  const { data: inventory, error: inventoryError } = await db
    .from("inventory")
    .select("product_id, quantity")
    .eq("store_id", storeId);

  if (inventoryError) {
    throw new Error(inventoryError.message);
  }

  const { data: products, error: productsError } = await db
    .from("products")
    .select("id, upc, retail_price, active");

  if (productsError) {
    throw new Error(productsError.message);
  }

  const productMap = new Map(
    (products ?? []).map((product) => [
      product.id,
      product,
    ])
  );

  const rows: ExportRow[] = [];
  let excludedCount = 0;

  for (const item of inventory ?? []) {
    const product = productMap.get(item.product_id);

    if (
      !product ||
      !product.active ||
      !isValidUpc(product.upc) ||
      Number(product.retail_price) <= 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 0
    ) {
      excludedCount++;
      continue;
    }

    rows.push({
      upc: product.upc.trim(),
      qty: item.quantity,
      price: Number(product.retail_price),
    });
  }

  rows.sort((a, b) => a.upc.localeCompare(b.upc));

  const csv = [
    "upc,qty,price",
    ...rows.map(
      (row) =>
        [
          escapeCsv(row.upc),
          row.qty,
          row.price.toFixed(2),
        ].join(",")
    ),
  ].join("\n");

  return {
    storeId,
    csv,
    productCount: rows.length,
    excludedCount,
  };
}
