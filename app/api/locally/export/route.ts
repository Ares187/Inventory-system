
import { NextRequest, NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { generateLocallyExports, loadLocallyStores } from "../../../../lib/locally/export";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (employee.role !== "owner") {
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 }
      );
    }

    const storeParam = request.nextUrl.searchParams.get("store");

    if (!storeParam || !/^[1-9]\d*$/.test(storeParam)) {
      return NextResponse.json(
        { error: "A valid store ID is required" },
        { status: 400 }
      );
    }

    const storeId = Number(storeParam);

    if (!Number.isSafeInteger(storeId)) {
      return NextResponse.json(
        { error: "Invalid store ID" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    const store = (await loadLocallyStores()).find((store) => store.id === storeId);
    if (!store) {
      return NextResponse.json({ error: "Store unavailable for Locally export" }, { status: 404 });
    }

    // Create a tracking record before generating the CSV.
    const { data: exportRecord, error: trackingError } = await db
      .from("locally_exports")
      .insert({
        store_id: storeId,
        status: "pending",
        dry_run: true,
      })
      .select("id")
      .single();

    if (trackingError || !exportRecord) {
      throw new Error(
        trackingError?.message ?? "Unable to create export record"
      );
    }

    try {
      const [result] = await generateLocallyExports([store]);

      // Mark CSV generation as successful.
      const { error: updateError } = await db
        .from("locally_exports")
        .update({
          status: "success",
          product_count: result.ready,
          excluded_count: result.excluded,
          completed_at: new Date().toISOString(),
        })
        .eq("id", exportRecord.id);

      if (updateError) {
        throw new Error(
          `Unable to update export record: ${updateError.message}`
        );
      }

      return new NextResponse(result.csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="locally-store-${storeId}.csv"`,
          "Cache-Control": "no-store",
          "X-Locally-Product-Count": String(result.ready),
          "X-Locally-Excluded-Count": String(result.excluded),
          "X-Locally-Export-Id": String(exportRecord.id),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Export failed";

      // Record the failure for troubleshooting.
      const { error: failureTrackingError } = await db
        .from("locally_exports")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", exportRecord.id);

      if (failureTrackingError) {
        console.error(
          "Unable to record Locally export failure:",
          failureTrackingError
        );
      }

      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Export failed";

    console.error("Locally export error:", error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
