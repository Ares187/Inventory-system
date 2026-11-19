
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { encryptHikeToken } from "../../../../lib/hike-crypto";

const REDIRECT_URI =
  "https://inventory-system-mu-rose.vercel.app/api/hike/callback";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("hike_oauth_state")?.value;
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { error: `Hike authorization failed: ${error}` },
      { status: 400 }
    );
  }

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.json(
      { error: "Invalid Hike authorization response" },
      { status: 400 }
    );
  }

  const clientId = process.env.HIKE_CLIENT_ID;
  const clientSecret = process.env.HIKE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Hike credentials are not configured" },
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenResponse = await fetch(
    "https://api.hikeup.com/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    }
  );

  if (!tokenResponse.ok) {
    return NextResponse.json(
      { error: "Hike token exchange failed" },
      { status: 502 }
    );
  }

  // Do not expose access or refresh tokens to the browser.
  // Secure token storage will be added before connecting.
  
  const tokens = await tokenResponse.json();

  if (
    typeof tokens.access_token !== "string" ||
    !Number.isFinite(Number(tokens.expires_in)) ||
    Number(tokens.expires_in) <= 0
  ) {
    return NextResponse.json(
      { error: "Invalid token response from Hike" },
      { status: 502 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { error: databaseError } = await supabase
    .from("hike_connections")
    .upsert(
      {
        store_name: "Sneaker Factory",
        access_token: encryptHikeToken(tokens.access_token),
        refresh_token:
          typeof tokens.refresh_token === "string"
            ? encryptHikeToken(tokens.refresh_token)
            : null,
        expires_at: new Date(
          Date.now() + Number(tokens.expires_in) * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_name" }
    );

  if (databaseError) {
    console.error("Failed to save Hike connection", databaseError.message);

    return NextResponse.json(
      { error: "Unable to save Hike connection" },
      { status: 500 }
    );
  }

  const response = NextResponse.json({
    message: "Hike connected successfully.",
  });


  response.cookies.delete("hike_oauth_state");

  return response;
}
