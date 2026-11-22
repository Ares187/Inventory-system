
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return Response.json(
        { error: "Login required" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "")
      .trim()
      .slice(0, 100);

    if (search.length < 2) {
      return Response.json({ products: [] });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, gender, brand, model, version, size, width, color, upc"
      )
      .eq("active", true)
      .or(
        `brand.ilike.%${search.replace(/[%,()]/g, "")}%,model.ilike.%${search.replace(/[%,()]/g, "")}%,upc.ilike.%${search.replace(/[%,()]/g, "")}%`
      )
      .order("brand")
      .order("model")
      .limit(100);

    if (error) throw error;

    return Response.json({ products: data ?? [] });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Product search failed"
      },
      { status: 500 }
    );
  }
}
