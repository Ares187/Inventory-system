import { hikeFetch } from "./hike-auth";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export async function scanHikeSales<T extends {
  id: string | number;
  transactionDate?: string;
}>(cutoff: string) {
  const start = Date.parse(cutoff);
  const end = Date.now();
  if (!Number.isFinite(start) || start > end) {
    throw new Error("Invalid Hike sales cutoff");
  }

  const sales: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const query = new URLSearchParams({
      page_size: String(PAGE_SIZE),
      skip_count: String(offset),
      invoice_range_from: new Date(start).toISOString(),
      invoice_range_to: new Date(end).toISOString(),
      Sorting: "id"
    });
    const response = await hikeFetch(
      `https://api.hikeup.com/api/v1/sales/get_all?${query}`
    );
    if (!response.ok) {
      throw new Error(`Hike sales request failed: ${response.status}`);
    }

    const payload: { totalCount?: number; items?: T[] } = await response.json();
    const count = payload.totalCount;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("Invalid Hike sales count");
    }
    if (count > MAX_PAGES * PAGE_SIZE) {
      throw new Error("Hike sales window exceeds the scan limit");
    }
    total ??= count;
    if (count !== total || !Array.isArray(payload.items) ||
        payload.items.length !== Math.min(PAGE_SIZE, total - offset)) {
      throw new Error("Hike sales pagination changed during the scan");
    }

    for (const sale of payload.items) {
      const id = String(sale.id ?? "").trim();
      const date = Date.parse(sale.transactionDate ?? "");
      if (!id || seen.has(id)) {
        throw new Error("Hike sales pagination returned a missing or duplicate sale ID");
      }
      if (!Number.isFinite(date) || date < start || date > end) {
        throw new Error("Hike returned a sale outside the requested invoice range");
      }
      seen.add(id);
      sales.push(sale);
    }

    if (sales.length === total) {
      return { sales, pagesChecked: page + 1, total };
    }
  }

  throw new Error("Hike sales scan did not complete");
}
