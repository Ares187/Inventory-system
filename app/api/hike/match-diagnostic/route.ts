
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { decryptHikeToken } from "../../../../lib/hike-crypto";

export const dynamic = "force-dynamic";

type CatalogProduct = {
  gender: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  size: string | null;
  width: string | null;
  active: boolean | null;
};

type HikeIndex = {
  hike_product_id: string;
  hike_variant_id: string;
  product_name: string | null;
  variant_name: string | null;
  size: string | null;
  width: string | null;
  classification: string | null;
};

type HikeItem = {
  id?: string | number;
  title?: string;
  sku?: string;
  quantity?: number;
  invoiceItemValue?: string | number;
  invoiceItemValueParent?: string | number;
};

type HikeSale = {
  id: string | number;
  status?: number;
  paymentStatus?: number;
  transactionDate?: string;
  invoiceLineItems?: HikeItem[];
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

function genderOf(value: unknown) {
  const text = normalize(value);
  if (/^(m|men|mens|male)\b/.test(text)) return "men";
  if (/^(w|women|womens|female)\b/.test(text)) return "women";
  return "";
}

function catalogName(product: CatalogProduct) {
  return normalize(
    [product.model, product.version].filter(Boolean).join(" ")
  );
}

function matchesModel(
  hikeName: string,
  product: CatalogProduct
) {
  const name = normalize(hikeName);
  const model = catalogName(product);
  const gender = genderOf(product.gender);
  const hikeGender = genderOf(name);

  if (!model || !gender || !hikeGender) return false;
  if (gender !== hikeGender) return false;

  // Require the complete model/version as consecutive words.
  // Avoid matching Ghost 17 to Ghost 18.
  const words = name.split(" ");
  const target = model.split(" ");

  for (let i = 0; i <= words.length - target.length; i++) {
    if (target.every((word, j) => words[i + j] === word)) {
      return true;
    }
  }

  return false;
}

async function readAllCatalog(
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const products: CatalogProduct[] = [];

  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("gender,brand,model,version,size,width,active")
      .range(start, start + 999);

    if (error) throw new Error(error.message);

    products.push(...((data ?? []) as CatalogProduct[]));

    if (!data || data.length < 1000) break;
  }

  return products.filter(p => p.active !== false);
}

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      const employee = await getLoggedInEmployee();

      if (!employee) {
        return NextResponse.json(
          { error: "Login required" },
          { status: 401 }
        );
      }

      if (employee.role !== "owner") {
        return NextResponse.json(
          { error: "Owner access required" },
          { status: 403 }
        );
      }
    }

    const supabase = getSupabaseAdmin();

    const { data: connection, error: connectionError } =
      await supabase
        .from("hike_connections")
        .select("access_token")
        .eq("store_name", "Sneaker Factory")
        .single();

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: "Hike connection unavailable" },
        { status: 400 }
      );
    }

    const token = decryptHikeToken(connection.access_token);

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    };

    const countResponse = await fetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1",
      { headers, cache: "no-store" }
    );

    if (!countResponse.ok) {
      throw new Error("Could not retrieve Hike sale count");
    }

    const countJson = await countResponse.json();
    const total = Number(countJson.totalCount);

    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Invalid Hike sale count");
    }

    const response = await fetch(
      `https://api.hikeup.com/api/v1/sales/get_all?page_size=100&skip_count=${Math.max(0, total - 100)}`,
      { headers, cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("Could not retrieve Hike sales");
    }

    const json = await response.json();
    const sales: HikeSale[] = Array.isArray(json.items)
      ? json.items
      : [];

    const catalog = await readAllCatalog(supabase);

    const uniqueModels = new Map<string, CatalogProduct>();

    for (const product of catalog) {
      const key = [
        genderOf(product.gender),
        normalize(product.brand),
        catalogName(product)
      ].join("|");

      if (!uniqueModels.has(key)) {
        uniqueModels.set(key, product);
      }
    }

    const models = [...uniqueModels.values()];

    const completedSales = sales.filter(
      sale => sale.status === 2 && sale.paymentStatus === 2
    );

    const items = completedSales.flatMap(sale =>
      (sale.invoiceLineItems ?? []).map(item => ({
        saleId: String(sale.id),
        itemId: String(item.id ?? ""),
        title: String(item.title ?? ""),
        sku: String(item.sku ?? ""),
        parentId: String(
          item.invoiceItemValueParent ??
          item.invoiceItemValue ??
          ""
        ),
        variantId: String(item.invoiceItemValue ?? ""),
        quantity: Number(item.quantity ?? 0)
      }))
    );

    const ids = [
      ...new Set(
        items.flatMap(item =>
          [item.parentId, item.variantId].filter(Boolean)
        )
      )
    ];

    const indexRows: HikeIndex[] = [];

    // Look up only IDs appearing in this sample.
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);

      const [parentResult, variantResult] = await Promise.all([
        supabase
          .from("hike_product_index")
          .select(
            "hike_product_id,hike_variant_id,product_name,variant_name,size,width,classification"
          )
          .in("hike_product_id", chunk),

        supabase
          .from("hike_product_index")
          .select(
            "hike_product_id,hike_variant_id,product_name,variant_name,size,width,classification"
          )
          .in("hike_variant_id", chunk)
      ]);

      if (parentResult.error) {
        throw new Error(parentResult.error.message);
      }

      if (variantResult.error) {
        throw new Error(variantResult.error.message);
      }

      indexRows.push(
        ...((parentResult.data ?? []) as HikeIndex[]),
        ...((variantResult.data ?? []) as HikeIndex[])
      );
    }

    const byVariant = new Map<string, HikeIndex>();
    const byParent = new Map<string, HikeIndex>();

    for (const row of indexRows) {
      if (row.hike_variant_id) {
        byVariant.set(String(row.hike_variant_id), row);
      } else {
        byParent.set(String(row.hike_product_id), row);
      }
    }

    const results = items.map(item => {
      const variant = byVariant.get(item.variantId);

      const parent =
        byParent.get(item.parentId) ??
        byParent.get(
          String(variant?.hike_product_id ?? "")
        );

      const parentName =
        parent?.product_name ??
        variant?.product_name ??
        item.title;

      const matchingModels = models.filter(model =>
        matchesModel(parentName, model)
      );

      const distinctMatches = new Map<string, CatalogProduct>();

      for (const model of matchingModels) {
        distinctMatches.set(
          [
            genderOf(model.gender),
            normalize(model.brand),
            catalogName(model)
          ].join("|"),
          model
        );
      }

      const matches = [...distinctMatches.values()];

      const size = variant?.size ?? null;
      const width = variant?.width ?? null;

      let result:
        | "pending_color_candidate"
        | "unresolved_candidate"
        | "possible_shoe_review"
        | "non_shoe_candidate";

      if (matches.length === 1 && size && width) {
        result = "pending_color_candidate";
      } else if (matches.length > 0) {
        result = "unresolved_candidate";
      } else if (
        variant?.classification === "shoe" ||
        parent?.classification === "shoe" ||
        (size && width)
      ) {
        result = "possible_shoe_review";
      } else {
        result = "non_shoe_candidate";
      }

      return {
        saleId: item.saleId,
        title: item.title,
        sku: item.sku,
        parentId: item.parentId,
        variantId: item.variantId,
        size,
        width,
        result,
        matchingModels: matches.map(m => ({
          gender: m.gender,
          brand: m.brand,
          model: m.model,
          version: m.version
        }))
      };
    });

    const categories = [
      "pending_color_candidate",
      "unresolved_candidate",
      "possible_shoe_review",
      "non_shoe_candidate"
    ];

    return NextResponse.json({
      success: true,
      mode: "read_only",
      catalogProducts: catalog.length,
      catalogModels: models.length,
      salesRetrieved: sales.length,
      completedSales: completedSales.length,
      lineItemsChecked: results.length,
      classificationCounts: categories.map(category => ({
        category,
        count: results.filter(r => r.result === category).length
      })),
      samples: Object.fromEntries(
        categories.map(category => [
          category,
          results.filter(r => r.result === category).slice(0, 10)
        ])
      ),
      recordsWritten: 0,
      inventoryChanged: false
    });
  } catch (error) {
    console.error("Hike matching diagnostic:", error);

    return NextResponse.json(
      {
        error: "Matching diagnostic failed",
        detail: error instanceof Error
          ? error.message
          : "Unknown error"
      },
      { status: 500 }
    );
  }
}
