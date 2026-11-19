
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export async function GET(request: Request) {
  const clientId = process.env.HIKE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Hike Client ID is not configured" },
      { status: 500 }
    );
  }

  const redirectUri =
  "https://inventory-system-mu-rose.vercel.app/api/hike/callback";

  const state = randomBytes(32).toString("hex");

  const authorizationUrl = new URL(
    "https://api.hikeup.com/oauth/authorize"
  );

  authorizationUrl.searchParams.set(
    "response_type",
    "code"
  );
  authorizationUrl.searchParams.set(
    "client_id",
    clientId
  );
  authorizationUrl.searchParams.set(
    "redirect_uri",
    redirectUri
  );
  authorizationUrl.searchParams.set(
    "scope",
    "all"
  );
  authorizationUrl.searchParams.set(
    "state",
    state
  );

  const response = NextResponse.redirect(
    authorizationUrl.toString()
  );

  response.cookies.set("hike_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
