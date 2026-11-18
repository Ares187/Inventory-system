
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("employees")
      .select("id, name")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");

    if (error) {
      console.error("Employee lookup failed:", error.message);

      return Response.json(
        { error: "Unable to load employees" },
        { status: 500 }
      );
    }

    return Response.json({ employees: data });
  } catch (error) {
    console.error("Employee API error:", error);

    return Response.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }
}
