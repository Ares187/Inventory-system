import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { ingestHikeSales } from "../../../../lib/hike-sales-ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee || employee.role !== "owner") {
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const testMode = body?.testMode === true;
    if (!testMode && body?.testMode !== false) {
      return NextResponse.json(
        { error: "Select test or live ingestion explicitly" },
        { status: 400 }
      );
    }

    return await ingestHikeSales(testMode, false);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
