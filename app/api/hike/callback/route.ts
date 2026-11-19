
import { NextRequest, NextResponse } from "next/server";

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
  const response = NextResponse.json({
    message:
      "Hike authorization succeeded. Secure token storage is not configured yet.",
  });

  response.cookies.delete("hike_oauth_state");

  return response;
}
