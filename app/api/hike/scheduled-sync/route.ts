import { timingSafeEqual } from "node:crypto";
import { ingestHikeSales } from "../../../../lib/hike-sales-ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.HIKE_SYNC_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);

  if (!secret || supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ingestHikeSales(false, true);
  if (!result.ok) {
    return Response.json({ error: "Hike synchronization failed. Check Vercel logs." }, { status: 502 });
  }
  return result;
}
