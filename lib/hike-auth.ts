
import "server-only";

import { getSupabaseAdmin } from "./supabase-admin";
import {
  encryptHikeToken,
  decryptHikeToken,
} from "./hike-crypto";

const STORE_NAME = "Sneaker Factory";
const TOKEN_URL = "https://api.hikeup.com/oauth/token";

type Connection = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
};

async function getConnection(): Promise<Connection> {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("hike_connections")
    .select(
      "id,access_token,refresh_token,expires_at"
    )
    .eq("store_name", STORE_NAME)
    .single();

  if (error || !data) {
    throw new Error("Hike connection unavailable");
  }

  return data as Connection;
}

function isExpiring(connection: Connection): boolean {
  if (!connection.expires_at) return true;

  const expires = Date.parse(connection.expires_at);

  if (!Number.isFinite(expires)) return true;

  // Refresh five minutes before expiration.
  return expires <= Date.now() + 5 * 60 * 1000;
}

async function refreshConnection(
  connection: Connection
): Promise<string> {
  const clientId = process.env.HIKE_CLIENT_ID;
  const clientSecret = process.env.HIKE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Hike OAuth client credentials are missing"
    );
  }

  const refreshToken = decryptHikeToken(
    connection.refresh_token
  );

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    // Another request may have refreshed the
    // token while this request was running.
    const latest = await getConnection();

    if (
      latest.refresh_token !== connection.refresh_token &&
      !isExpiring(latest)
    ) {
      return decryptHikeToken(latest.access_token);
    }

    throw new Error(
      `Hike token refresh failed (HTTP ${response.status}). ` +
      "The Hike connection may need reauthorization."
    );
  }

  const result =
    (await response.json()) as TokenResponse;

  const accessToken = result.access_token;
  const newRefreshToken = result.refresh_token;

  const expiresIn = Number(result.expires_in);

  if (
    !accessToken ||
    !newRefreshToken ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error(
      "Hike returned an incomplete token response"
    );
  }

  const db = getSupabaseAdmin();

  const expiresAt = new Date(
    Date.now() + expiresIn * 1000
  ).toISOString();

  // Only update the row if its refresh token
  // has not already been replaced.
  const { data, error } = await db
    .from("hike_connections")
    .update({
      access_token: encryptHikeToken(accessToken),
      refresh_token: encryptHikeToken(
        newRefreshToken
      ),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("refresh_token", connection.refresh_token)
    .select("id");

  if (error) {
    throw new Error(
      `Could not save refreshed Hike token: ${error.message}`
    );
  }

  if (!data || data.length === 0) {
    // Another request saved a newer token first.
    const latest = await getConnection();

    return decryptHikeToken(latest.access_token);
  }

  return accessToken;
}

export async function getHikeAccessToken(
  forceRefresh = false
): Promise<string> {
  const connection = await getConnection();

  if (!forceRefresh && !isExpiring(connection)) {
    return decryptHikeToken(
      connection.access_token
    );
  }

  return refreshConnection(connection);
}

export async function hikeFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  if (
    !url.startsWith(
      "https://api.hikeup.com/api/"
    )
  ) {
    throw new Error("Invalid Hike API URL");
  }

  async function request(token: string) {
    const headers = new Headers(init.headers);

    headers.set(
      "Authorization",
      `Bearer ${token}`
    );

    headers.set("Accept", "application/json");

    return fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
  }

  const token = await getHikeAccessToken();

  let response = await request(token);

  if (response.status === 401) {
    const newToken = await getHikeAccessToken(true);
    response = await request(newToken);
  }

  return response;
}
