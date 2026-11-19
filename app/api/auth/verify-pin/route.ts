
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employeeId, pin } = body;

    if (
      !Number.isSafeInteger(employeeId) ||
      employeeId <= 0 ||
      typeof pin !== "string" ||
      !/^[0-9]{4}$/.test(pin)
    ) {
      return Response.json(
        { error: "Invalid login information" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check the employee's PIN
    const { data: valid, error: verifyError } =
      await supabase.rpc("verify_employee_pin", {
        p_employee_id: employeeId,
        p_pin: pin,
      });

    if (verifyError) {
      console.error("PIN verification failed:", verifyError.message);
      return Response.json(
        { error: "Unable to verify login" },
        { status: 500 }
      );
    }

    if (!valid) {
      return Response.json(
        { valid: false },
        { status: 401 }
      );
    }

const { data: loginEmployee, error: employeeError } =
  await supabase
    .from("employees")
    .select("active, deleted_at")
    .eq("id", employeeId)
    .maybeSingle();

if (employeeError) {
  return Response.json(
    { error: "Unable to verify employee status" },
    { status: 500 }
  );
}

if (
  !loginEmployee ||
  !loginEmployee.active ||
  loginEmployee.deleted_at !== null
) {
  return Response.json(
    { error: "Employee account is unavailable" },
    { status: 403 }
  );
}

    // Generate a cryptographically random session token
    const token = randomBytes(32).toString("hex");

    // Store only the hash in Supabase
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    // Sessions last 12 hours
    const expiresAt = new Date(
      Date.now() + 12 * 60 * 60 * 1000
    );

    const { error: sessionError } = await supabase
      .from("employee_sessions")
      .insert({
        employee_id: employeeId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });

    if (sessionError) {
      console.error("Session creation failed:", sessionError.message);
      return Response.json(
        { error: "Unable to create session" },
        { status: 500 }
      );
    }

    // Store the token in an HTTP-only browser cookie
    const cookieStore = await cookies();

    cookieStore.set("sf_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return Response.json({ valid: true });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json(
      { error: "Unable to process login" },
      { status: 500 }
    );
  }
}
