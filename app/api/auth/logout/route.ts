
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("sf_session")?.value;

    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

      const supabase = getSupabaseAdmin();

      const { error } = await supabase
        .from("employee_sessions")
        .update({
          revoked_at: new Date().toISOString(),
        })
        .eq("token_hash", tokenHash);

      if (error) {
        console.error("Logout session revocation failed:", error.message);

        return NextResponse.json(
          { error: "Unable to sign out" },
          { status: 500 }
        );
      }
    }

    cookieStore.delete("sf_session");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);

    return NextResponse.json(
      { error: "Unable to sign out" },
      { status: 500 }
    );
  }
}
