
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../lib/employee-session";

export async function GET() {
  try {
    // Only logged-in employees can access inventory
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Retrieve all active stores
    const { data: stores, error: storesError } =
      await supabase
        .from("stores")
        .select("id, name")
        .eq("active", true)
        .order("id");

    if (storesError) {
      throw new Error(storesError.message);
    }

    // Retrieve all active shoe variants
    const { data: products, error: productsError } =
      await supabase
        .from("products")
        .select(`
          id,
          gender,
          brand,
          model,
          version,
          size,
          width,
          color,
          upc,
          internal_sku,
          retail_price
        `)
        .eq("active", true)
        .order("brand")
        .order("model")
        .order("size");

    if (productsError) {
      throw new Error(productsError.message);
    }

    // Retrieve inventory quantities
    const { data: inventory, error: inventoryError } =
      await supabase
        .from("inventory")
        .select("store_id, product_id, quantity");

    if (inventoryError) {
      throw new Error(inventoryError.message);
    }

    return Response.json({
      stores,
      products,
      inventory,
    });
  } catch (error) {
    console.error("Inventory API error:", error);

    return Response.json(
      { error: "Unable to load inventory" },
      { status: 500 }
    );
  }
}
