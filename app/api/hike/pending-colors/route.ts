import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getLoggedInEmployee())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin().rpc("get_pending_hike_colors");
  if (error) {
    console.error("Hike color queue:", error.message);
    return Response.json({ error: "Unable to load pending colors" }, { status: 500 });
  }

  return Response.json({ sales: data });
}
