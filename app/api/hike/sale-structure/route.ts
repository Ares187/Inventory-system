
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { hikeFetch } from "../../../../lib/hike-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      const employee = await getLoggedInEmployee();

      if (!employee || employee.role !== "owner") {
        return NextResponse.json(
          { error: "Owner access required" },
          { status: 403 }
        );
      }
    }

    const countResponse = await hikeFetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1"
    );

    if (!countResponse.ok) {
      throw new Error(
        `Sales count failed: HTTP ${countResponse.status}`
      );
    }

    const countData = await countResponse.json();
    const total = Number(countData.totalCount);

    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Invalid Hike sales count");
    }

    const response = await hikeFetch(
      `https://api.hikeup.com/api/v1/sales/get_all?page_size=5&skip_count=${Math.max(0, total - 5)}`
    );

    if (!response.ok) {
      throw new Error(
        `Hike request failed: HTTP ${response.status}`
      );
    }

    const data = await response.json();
    const sales = Array.isArray(data.items)
      ? data.items
      : [];

    return NextResponse.json({
      success: true,
      totalSales: total,
      sales: sales.map((sale: Record<string, unknown>) => ({
        saleId: sale.id,
        outletId: sale.outletId ?? null,
        transactionDate: sale.transactionDate ?? null,
        finalizeDate: sale.finalizeDate ?? null,
        creationTime: sale.creationTime ?? null,
        status: sale.status,
        paymentStatus: sale.paymentStatus,
        itemCount: Array.isArray(sale.invoiceLineItems)
          ? sale.invoiceLineItems.length
          : null
      })),
      inventoryChanged: false
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Hike sale structure diagnostic failed",
        detail:
          error instanceof Error
            ? error.message
            : "Unknown error"
      },
      { status: 500 }
    );
  }
}
