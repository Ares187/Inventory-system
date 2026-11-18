
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../lib/employee-session";

export async function GET() {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("stores")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (error) {
      throw error;
    }

    return NextResponse.json({
      stores: data ?? [],
    });
  } catch (error) {
    console.error("Store lookup failed:", error);

    return NextResponse.json(
      { error: "Unable to load stores" },
      { status: 500 }
    );
  }
}
