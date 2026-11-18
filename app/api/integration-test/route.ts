
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getLoggedInEmployee } from "../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { processTestSale } from "../../../lib/integrations/hike-sales";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Disable integration testing in production.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Testing is disabled in production" },
      { status: 403 }
    );
  }

  // Only owners can run integration tests.
  const employee = await getLoggedInEmployee();

  if (!employee || employee.role !== "owner") {
    return NextResponse.json(
      { error: "Owner access required" },
      { status: 403 }
    );
  }

  // Require requests from this website.
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 }
    );
  }

  const db = getSupabaseAdmin();

  // Read the optional sale ID.
  // No sale ID = create a new test sale.
  // Existing sale ID = replay that sale.
  const body = await request.json().catch(() => ({}));

  const requestedSaleId =
    body &&
    typeof body === "object" &&
    !Array.isArray(body)
      ? body.saleId
      : undefined;

const testMode =
  body &&
  typeof body === "object" &&
  !Array.isArray(body)
    ? body.mode
    : undefined;

if (
  testMode !== undefined &&
  testMode !== "insufficient_inventory" &&
  testMode !== "concurrent_duplicate"
) {
  return NextResponse.json(
    { error: "Invalid test mode" },
    { status: 400 }
  );
}

if (
  testMode === "insufficient_inventory" &&
  requestedSaleId !== undefined
) {
  return NextResponse.json(
    { error: "Cannot replay a failure test" },
    { status: 400 }
  );
}

  // Find the dedicated test store.
  const { data: storeMapping, error: storeError } =
    await db
      .from("integration_store_mappings")
      .select("local_store_id")
      .eq("provider", "hike_test")
      .eq("external_store_id", "test-store-001")
      .single();

  // Find the dedicated test product.
  const { data: productMapping, error: productError } =
    await db
      .from("integration_product_mappings")
      .select("local_product_id")
      .eq("provider", "hike_test")
      .eq("external_product_id", "test-product-001")
      .single();

  if (
    storeError ||
    productError ||
    !storeMapping ||
    !productMapping
  ) {
    return NextResponse.json(
      { error: "Test mappings not found" },
      { status: 500 }
    );
  }

  // Verify that mappings point to our test records.
  const { data: store } = await db
    .from("stores")
    .select("id, name, active")
    .eq("id", storeMapping.local_store_id)
    .single();

  const { data: product } = await db
    .from("products")
    .select("id, brand, model, active")
    .eq("id", productMapping.local_product_id)
    .single();

  if (
    !store ||
    store.name !== "Hike Integration Test Store" ||
    store.active !== false ||
    !product ||
    product.brand !== "Integration Test" ||
    product.model !== "Test Running Shoe" ||
    product.active !== false
  ) {
    return NextResponse.json(
      { error: "Test fixture validation failed" },
      { status: 403 }
    );
  }

  // Check the starting inventory.
  const { data: before, error: beforeError } =
    await db
      .from("inventory")
      .select("quantity")
      .eq("store_id", store.id)
      .eq("product_id", product.id)
      .single();

  if (beforeError || !before) {
    return NextResponse.json(
      { error: "Unable to read test inventory" },
      { status: 500 }
    );
  }

  let saleId: string;
  let isReplay = false;

  if (requestedSaleId !== undefined) {
    // Replay an existing sale.
    if (
      typeof requestedSaleId !== "string" ||
      !/^website-test-[0-9a-f-]{36}$/.test(
        requestedSaleId
      )
    ) {
      return NextResponse.json(
        { error: "Invalid test sale ID" },
        { status: 400 }
      );
    }

    saleId = requestedSaleId;
    isReplay = true;

    // Only replay an already-applied test sale.
    const { data: existing, error: lookupError } =
      await db
        .from("integration_events")
        .select("id, status")
        .eq("provider", "hike_test")
        .eq("external_event_id", saleId)
        .eq("event_type", "sale")
        .single();

    if (
      lookupError ||
      !existing ||
      existing.status !== "applied"
    ) {
      return NextResponse.json(
        {
          error:
            "Original test sale not found or not applied",
        },
        { status: 400 }
      );
    }
  } else {
    // Create a new test sale.
    if (
     testMode !== "insufficient_inventory" &&
      before.quantity < 2
    ) {
      return NextResponse.json(
        { error: "Insufficient test inventory" },
        { status: 400 }
      );
    }

    saleId = `website-test-${randomUUID()}`;
  }

  if (testMode === "concurrent_duplicate") {
    if (before.quantity < 2) {
      return NextResponse.json(
        { error: "Insufficient test inventory" },
        { status: 400 }
      );
    }

    const concurrentSale = {
      saleId,
      payload: {
        source: "website-integration-test",
        saleId,
      },
      items: [
        {
          lineId: "line-1",
          storeId: "test-store-001",
          productId: "test-product-001",
          quantity: 2,
        },
      ],
    };

    try {
      // Submit the identical sale twice simultaneously.
      const results = await Promise.all([
        processTestSale(concurrentSale),
        processTestSale(concurrentSale),
      ]);

      const { data: after, error: afterError } = await db
        .from("inventory")
        .select("quantity")
        .eq("store_id", store.id)
        .eq("product_id", product.id)
        .single();

      if (afterError || !after) {
        throw new Error("Unable to verify test inventory");
      }

      const statuses = results.map((r) => r.status);

      const passed =
        statuses.includes("applied") &&
        statuses.includes("already_applied") &&
        after.quantity === before.quantity - 2;

      return NextResponse.json({
        saleId,
        statuses,
        before: before.quantity,
        after: after.quantity,
        expectedAfter: before.quantity - 2,
        passed,
        testType: "concurrent_duplicate",
        errors: results.map((r) => r.error ?? null),
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Concurrent test failed",
        },
        { status: 500 }
      );
    }
  }

  try {
    // Process through the actual integration service.
    const saleQuantity =
  testMode === "insufficient_inventory"
    ? before.quantity + 1
    : 2;
    const result = await processTestSale({
      saleId,
      payload: {
        source: "website-integration-test",
        saleId,
      },
      items: [
        {
          lineId: "line-1",
          storeId: "test-store-001",
          productId: "test-product-001",
          quantity: saleQuantity,
        },
      ],
    });

    // Check inventory after processing.
    const { data: after, error: afterError } =
      await db
        .from("inventory")
        .select("quantity")
        .eq("store_id", store.id)
        .eq("product_id", product.id)
        .single();

    if (afterError || !after) {
      throw new Error(
        "Unable to verify test inventory"
      );
    }

    // New sales deduct 2.
    // Replayed sales should deduct nothing.
    
const expectedAfter =
  testMode === "insufficient_inventory" || isReplay
    ? before.quantity
    : before.quantity - 2;

const passed =
  testMode === "insufficient_inventory"
    ? result.status === "failed" &&
      after.quantity === before.quantity
    : isReplay
      ? result.status === "already_applied" &&
        after.quantity === before.quantity
      : result.status === "applied" &&
        after.quantity === before.quantity - 2;


    return NextResponse.json({
      saleId,
      eventId: result.eventId,
      status: result.status,
      before: before.quantity,
      after: after.quantity,
      expectedAfter,
      passed,
      isReplay,
      error: result.error ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown integration test error",
      },
      { status: 500 }
    );
  }
}
