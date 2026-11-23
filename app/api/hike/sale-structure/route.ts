
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { hikeFetch } from "../../../../lib/hike-auth";

export const dynamic = "force-dynamic";

type HikeLine = {
  id?: string | number;
  title?: string;
  sku?: string;
  barcode?: string;
  quantity?: number;
  invoiceItemValue?: {
    id?: string | number;
    productId?: string | number;
    productVariantId?: string | number;
  };
  invoiceItemValueParent?: {
    id?: string | number;
    productId?: string | number;
  };
};

type HikeSale = {
  id: string | number;
  outletId?: string | number;
  transactionDate?: string;
  status?: number;
  paymentStatus?: number;
  invoiceLineItems?: HikeLine[];
};

export async function GET() {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee || employee.role !== "owner") {
      return NextResponse.json(
        { error: "Owner access required" },
        { status: 403 }
      );
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

    const sales: HikeSale[] = Array.isArray(data.items)
      ? data.items
      : [];

    return NextResponse.json({
      success: true,
      totalSales: total,
      sales: sales.map((sale) => ({
        saleId: sale.id,
        outletId: sale.outletId ?? null,
        transactionDate: sale.transactionDate ?? null,
        status: sale.status,
        paymentStatus: sale.paymentStatus,
        items: (sale.invoiceLineItems ?? []).map((line) => ({
          lineId: line.id ?? null,
          title: line.title ?? null,
          sku: line.sku ?? null,
          barcode: line.barcode ?? null,
          quantity: line.quantity ?? null,
          invoiceItemValue: line.invoiceItemValue ?? null,
          invoiceItemValueParent:
            line.invoiceItemValueParent ?? null
        }))
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
            : String(error)
      },
      { status: 500 }
    );
  }
}
