
import "server-only";
import { getSupabaseAdmin } from "../supabase-admin";

export type ExternalSaleItem = {
  lineId: string;
  storeId: string;
  productId: string;
  quantity: number;
};

export type ExternalSale = {
  saleId: string;
  items: ExternalSaleItem[];
  payload: Record<string, unknown>;
};

export type SaleResult = {
  eventId: number;
  status:
    | "applied"
    | "already_applied"
    | "failed";
  error?: string;
};

async function processSale(
       sale: ExternalSale,
  provider: "hike" | "hike_test"
): Promise<SaleResult> {
  const db = getSupabaseAdmin();

  if (!sale.saleId?.trim()) {
    throw new Error("Sale ID is required");
  }

  if (
    !sale.payload ||
    typeof sale.payload !== "object" ||
    Array.isArray(sale.payload)
  ) {
    throw new Error("Invalid sale payload");
  }

  if (
    !Array.isArray(sale.items) ||
    sale.items.length === 0
  ) {
    throw new Error("Sale must contain at least one item");
  }

  const lineIds = new Set<string>();

  for (const item of sale.items) {
    if (
      !item.lineId?.trim() ||
      !item.storeId?.trim() ||
      !item.productId?.trim() ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error("Invalid sale item");
    }

    if (lineIds.has(item.lineId)) {
      throw new Error("Duplicate sale line ID");
    }

    lineIds.add(item.lineId);
  }

  // Register and finalize the entire sale
  // in one database transaction.
  const { data: registered, error: registerError } =
    await db.rpc("register_complete_integration_sale", {
      p_provider: provider,
      p_external_event_id: sale.saleId,
      p_payload: sale.payload,
      p_items: sale.items,
    });

  if (registerError) {
    throw new Error(registerError.message);
  }

  const event = registered?.[0];

  if (!event) {
    throw new Error("Sale registration returned no data");
  }

  const eventId = Number(event.event_id);

  if (!Number.isSafeInteger(eventId)) {
    throw new Error("Invalid event ID returned");
  }

  // Never apply the same sale twice.

  // Check whether an existing sale can be
  // safely resumed after an interruption.
  if (!event.was_created) {

    const { data: recovery, error: recoveryError } =
      await db.rpc("check_integration_sale_recovery", {
        p_event_id: eventId,
        p_payload: sale.payload,
        p_items: sale.items,
      });

    if (recoveryError) {
      return {
        eventId,
        status: "failed",
        error: recoveryError.message,
      };
    }

    if (recovery === "already_applied") {
      return {
        eventId,
        status: "already_applied",
      };
    }

    if (recovery !== "safe_to_retry") {
      return {
        eventId,
        status: "failed",
        error:
          "Existing sale requires manual review",
      };
    }
  }


  // Registration is now complete and the
  // event is ready for inventory processing.
  const { data: result, error: applyError } =
    await db.rpc("apply_integration_sale", {
      p_event_id: eventId,
    });

  if (!applyError) {
    return {
      eventId,
      status:
        result === "already_applied"
          ? "already_applied"
          : "applied",
    };
  }

  // Inventory processing failed.
  // Record the failure in a separate transaction.
  const { error: failureError } = await db.rpc(
    "record_integration_failure",
    {
      p_event_id: eventId,
      p_error_message: applyError.message,
    }
  );

  if (failureError) {
    throw new Error(
      "Sale processing failed, and failure logging " +
      "also failed: " + failureError.message
    );
  }

  return {
    eventId,
    status: "failed",
    error: applyError.message,
  };
}

export async function processHikeSale(
  sale: ExternalSale
): Promise<SaleResult> {
  return processSale(sale, "hike");
}

export async function processTestSale(
  sale: ExternalSale
): Promise<SaleResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Integration testing is disabled in production"
    );
  }

  return processSale(sale, "hike_test");
}
