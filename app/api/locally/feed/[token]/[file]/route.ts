import {
  generateLocallyExports,
  loadLocallyStores,
  locallyMappingIssue,
} from "../../../../../../lib/locally/export";
import { locallyFeedEnabled, validLocallyFeedToken } from "../../../../../../lib/locally/feed";

import { getSupabaseAdmin } from "../../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; file: string }> }
) {
  const { token, file } = await params;
  const match = /^store-([123])\.csv$/.exec(file);

  if (!locallyFeedEnabled() || !match || !/^[a-f0-9]{64}$/.test(token)) {
    return new Response(null, { status: 404, headers });
  }

  try {
    const stores = await loadLocallyStores();
    const store = stores.find(({ id }) => id === Number(match[1]));
    if (!store || locallyMappingIssue(store, stores) || !validLocallyFeedToken(store, token)) {
      return new Response(null, { status: 404, headers });
    }

    const [result] = await generateLocallyExports([store]);
    if (!result.ready || result.blockingExclusions) {
      return new Response("Inventory feed is not ready", { status: 503, headers });
    }

    const { error: logError } = await getSupabaseAdmin().from("locally_exports").insert({
      store_id: store.id,
      status: "success",
      dry_run: false,
      product_count: result.ready,
      excluded_count: result.excluded,
      completed_at: new Date().toISOString(),
    });
    if (logError) console.error("Unable to record Locally feed response:", logError.message);

    return new Response(result.csv, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
      },
    });
  } catch (error) {
    console.error("Locally feed generation failed:", error);
    return new Response(null, { status: 503, headers });
  }
}
