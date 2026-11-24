import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

import { ingestHikeSales } from "../../../../lib/hike-sales-ingestion";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getLoggedInEmployee())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new URL(request.url).searchParams.get("count") === "1") {
    const { data, error } = await getSupabaseAdmin().rpc("count_pending_hike_color_sales");
    if (error) {
      console.error("Hike color queue count:", error.message);
      return Response.json({ error: "Unable to count pending sales" }, { status: 500 });
    }
    return Response.json({ count: Number(data) });
  }
  return loadQueue();
}

let activeRefresh: Promise<Response> | null = null;

export async function POST(request: Request) {
  if (!(await getLoggedInEmployee())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require a header that a cross-site form cannot send.
  if (request.headers.get("x-feldryva-refresh") !== "pending-colors") {
    return Response.json({ error: "Invalid refresh request" }, { status: 400 });
  }

  activeRefresh ??= ingestHikeSales(false, true).finally(() => {
    activeRefresh = null;
  });
  const sync = await activeRefresh;
  const syncWarning = sync.ok
    ? null
    : "Could not check Hike for new sales. Showing sales already received. Refresh to retry.";

  return loadQueue(syncWarning);
}

async function loadQueue(syncWarning: string | null = null) {
  const { data, error } = await getSupabaseAdmin().rpc("get_pending_hike_colors");
  if (error) {
    console.error("Hike color queue:", error.message);
    return Response.json({ error: "Unable to load pending colors" }, { status: 500 });
  }

  return Response.json({ sales: data, syncWarning });
}
