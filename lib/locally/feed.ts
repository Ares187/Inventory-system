import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { LocallyStore } from "./export";

export function locallyFeedEnabled(): boolean {
  return process.env.LOCALLY_FEED_ENABLED === "true" &&
    /^[a-f0-9]{64}$/.test(process.env.LOCALLY_FEED_SECRET ?? "");
}

function tokenFor(store: LocallyStore): string | null {
  const secret = process.env.LOCALLY_FEED_SECRET;
  const location = store.locally_location_id?.trim();
  if (!locallyFeedEnabled() || !secret || !location) return null;
  return createHmac("sha256", secret)
    .update(JSON.stringify([store.id, location]))
    .digest("hex");
}

export function locallyFeedPath(store: LocallyStore): string | null {
  const token = tokenFor(store);
  return token ? `/api/locally/feed/${token}/store-${store.id}.csv` : null;
}

export function validLocallyFeedToken(store: LocallyStore, token: string): boolean {
  const expected = tokenFor(store);
  return expected !== null && /^[a-f0-9]{64}$/.test(token) &&
    timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
}
