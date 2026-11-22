
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { hikeFetch } from "../../../../lib/hike-auth";

export const dynamic = "force-dynamic";

type IndexRow = {
  hike_product_id: string;
  hike_variant_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  sku: string | null;
  barcode: string | null;
  size: string | null;
  width: string | null;
  color: string | null;
};

type MasterRow = {
  hike_parent_id: string;
  parent_sku: string;
  shoe_name: string;
};

type Product = {
  id: number;
  gender: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  size: string | null;
  width: string | null;
  color: string | null;
  upc: string | null;
  active: boolean | null;
};

type SaleItem = {
  id?: string | number;
  title?: string;
  sku?: string;
  barcode?: string;
  quantity?: number;
  refundedQuantity?: number;
  invoiceItemValue?: string | number;
  invoiceItemValueParent?: string | number;
};

type Sale = {
  id: string | number;
  status?: number;
  paymentStatus?: number;
  invoiceLineItems?: SaleItem[];
};

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const versionNorm = (v: unknown) =>
  norm(v)
    .split(" ")
    .map(t => t.replace(/^v(?=\d)/, ""))
    .join(" ");

function gender(v: unknown): string {
  const s = norm(v);

  if (["m", "men", "mens", "male"].includes(s)) return "m";
  if (["w", "women", "womens", "female"].includes(s)) return "w";

  return "";
}

function identity(
  model: string | null,
  version: string | null
) {
  const name = versionNorm(model);
  const ver = versionNorm(version);

  if (!ver || name.split(" ").at(-1) === ver) {
    return name;
  }

  return `${name} ${ver}`.trim();
}

function shoeNameParts(name: unknown) {
  // Example:
  // W Glycerin 23 / 10 / B / Black/Black/Ebony

  const segments = String(name ?? "")
    .split(/\s+\/\s+/)
    .map(s => s.trim());

  const first = segments[0] ?? "";

  const match = first.match(
    /^\s*(M|W|Men|Mens|Women|Womens)\s+(.+)$/i
  );

  return {
    gender: match ? gender(match[1]) : "",
    model: match ? versionNorm(match[2]) : "",
    size: segments.length >= 3 ? segments[1] : null,
    width: segments.length >= 3 ? segments[2] : null,
    color:
      segments.length >= 4
        ? segments.slice(3).join(" / ")
        : null,
    hasVariantDetails: segments.length >= 3
  };
}

function matchesModelName(
  name: unknown,
  p: Product
) {
  const parts = shoeNameParts(name);
  const target = identity(p.model, p.version);
  const brand = versionNorm(p.brand);

  return Boolean(
    parts.gender &&
    target &&
    parts.gender === gender(p.gender) &&
    (
      parts.model === target ||
      parts.model === `${brand} ${target}`
    )
  );
}

function same(a: unknown, b: unknown) {
  return norm(a) === norm(b);
}

function uniqueProducts(products: Product[]) {
  return [
    ...new Map(
      products.map(p => [p.id, p])
    ).values()
  ];
}

async function getAll<T>(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  columns: string
): Promise<T[]> {
  const result: T[] = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(offset, offset + 999);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    result.push(...((data ?? []) as T[]));

    if (!data || data.length < 1000) break;
  }

  return result;
}

export async function GET() {
  try {
    // Require owner authorization on the deployed site.
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

    const db = getSupabaseAdmin();

    const {
      data: settings,
      error: settingsError
    } = await db
      .from("hike_sync_settings")
      .select("enabled,live_mode,sales_cutoff")
      .eq("id", 1)
      .single();

    if (settingsError || !settings) {
      throw new Error("Sync settings unavailable");
    }

    // hikeFetch handles expired access tokens,
    // refreshes credentials, and retries a 401.
    const countResponse = await hikeFetch(
      "https://api.hikeup.com/api/v1/sales/get_all?page_size=1"
    );

    if (!countResponse.ok) {
      throw new Error(
        `Hike sales count failed (HTTP ${countResponse.status})`
      );
    }

    const countData = await countResponse.json();
    const total = Number(countData.totalCount);

    if (
      !Number.isSafeInteger(total) ||
      total < 0
    ) {
      throw new Error("Invalid Hike sales count");
    }

    const salesResponse = await hikeFetch(
      `https://api.hikeup.com/api/v1/sales/get_all?page_size=100&skip_count=${Math.max(0, total - 100)}`
    );

    if (!salesResponse.ok) {
      throw new Error(
        `Hike sales request failed (HTTP ${salesResponse.status})`
      );
    }

    const salesData = await salesResponse.json();

    const sales: Sale[] = Array.isArray(
      salesData.items
    )
      ? salesData.items
      : [];

    const completed = sales.filter(
      s =>
        s.status === 2 &&
        s.paymentStatus === 2
    );

    const items = completed.flatMap(s =>
      (s.invoiceLineItems ?? [])
        .filter(i =>
          Number(i.quantity ?? 0) > 0 &&
          Number(i.refundedQuantity ?? 0) === 0
        )
        .map(i => ({
          saleId: String(s.id),
          lineId: String(i.id ?? ""),
          title: String(i.title ?? ""),
          sku: String(i.sku ?? ""),
          barcode: String(i.barcode ?? ""),
          parentId: String(
            i.invoiceItemValueParent ??
            i.invoiceItemValue ??
            ""
          ),
          variantId: String(
            i.invoiceItemValue ?? ""
          ),
          quantity: Number(i.quantity ?? 0)
        }))
    );

    const master = await getAll<MasterRow>(
      db,
      "hike_shoe_master",
      "id,hike_parent_id,parent_sku,shoe_name"
    );

    const products = (
      await getAll<Product>(
        db,
        "products",
        "id,gender,brand,model,version,size,width,color,upc,active"
      )
    ).filter(p => p.active !== false);

    const approvedById = new Map(
      master.map(m => [
        String(m.hike_parent_id),
        m
      ])
    );

    const productsByUpc = new Map<
      string,
      Product[]
    >();

    for (const p of products) {
      const upc = String(
        p.upc ?? ""
      ).trim();

      if (upc) {
        productsByUpc.set(
          upc,
          [
            ...(productsByUpc.get(upc) ?? []),
            p
          ]
        );
      }
    }

    const ids = [
      ...new Set(
        items.flatMap(i => [
          i.parentId,
          i.variantId
        ]).filter(Boolean)
      )
    ];

    const indexRows: IndexRow[] = [];

    for (
      const column of [
        "hike_product_id",
        "hike_variant_id"
      ] as const
    ) {
      for (
        let start = 0;
        start < ids.length;
        start += 40
      ) {
        const chunk = ids.slice(
          start,
          start + 40
        );

        for (
          let offset = 0;
          ;
          offset += 1000
        ) {
          const {
            data,
            error
          } = await db
            .from("hike_product_index")
            .select(
              "hike_product_id,hike_variant_id,product_name,variant_name,sku,barcode,size,width,color"
            )
            .in(column, chunk)
            .order("id", {
              ascending: true
            })
            .range(
              offset,
              offset + 999
            );

          if (error) {
            throw new Error(error.message);
          }

          indexRows.push(
            ...((data ?? []) as IndexRow[])
          );

          if (
            !data ||
            data.length < 1000
          ) break;
        }
      }
    }

    const indexByStandaloneId =
      new Map<string, IndexRow>();

    const indexByVariantId =
      new Map<string, IndexRow>();

    for (const row of indexRows) {
      if (row.hike_variant_id) {
        indexByVariantId.set(
          String(row.hike_variant_id),
          row
        );
      } else {
        indexByStandaloneId.set(
          String(row.hike_product_id),
          row
        );
      }
    }

    const results = items.map(item => {
      const variant =
        indexByVariantId.get(
          item.variantId
        );

      const standalone =
        indexByStandaloneId.get(
          item.variantId
        ) ??
        indexByStandaloneId.get(
          item.parentId
        );

      const row = variant ?? standalone;

      const actualParentId = String(
        variant?.hike_product_id ??
        item.parentId
      );

      const approvedParent =
        approvedById.get(
          actualParentId
        );

      const barcode = String(
        row?.barcode ||
        item.barcode ||
        ""
      ).trim();

      const sku = String(
        row?.sku ||
        item.sku ||
        ""
      ).trim();

      const fullName =
        row?.product_name ||
        item.title;

      const parsed =
        shoeNameParts(fullName);

      // Standalone shoes do not have a parent
      // relationship. Match the complete base
      // name against the approved master.
      const standaloneApproved =
        !approvedParent && !variant
          ? master.filter(m => {
              const masterParts =
                shoeNameParts(
                  m.shoe_name
                );

              return Boolean(
                parsed.gender &&
                parsed.model &&
                parsed.gender ===
                  masterParts.gender &&
                parsed.model ===
                  masterParts.model
              );
            })
          : [];

      const approved =
        approvedParent ??
        (
          standaloneApproved.length === 1
            ? standaloneApproved[0]
            : null
        );

      // UPC alone cannot approve merchandise
      // outside the shoe master list.
      if (!approved) {
        return {
          saleId: item.saleId,
          lineId: item.lineId,
          title: item.title,
          sku,
          hikeProductId:
            item.variantId,
          parentId: actualParentId,
          quantity: item.quantity,
          category:
            standaloneApproved.length > 1
              ? "needs_manual_review"
              : "excluded_merchandise",
          reason:
            standaloneApproved.length > 1
              ? "Ambiguous approved shoe family"
              : "Not in approved shoe master",
          matchingProductIds:
            [] as number[]
        };
      }

      const approvedParts =
        shoeNameParts(
          approved.shoe_name
        );

      const parsedVariant =
        shoeNameParts(fullName);

      const size =
        row?.size ||
        parsedVariant.size;

      const width =
        row?.width ||
        parsedVariant.width;

      const color =
        row?.color ||
        parsedVariant.color;

      const matchingFamily =
        products.filter(p =>
          matchesModelName(
            approved.shoe_name,
            p
          )
        );

      const upcMatches = barcode
        ? uniqueProducts(
            productsByUpc.get(
              barcode
            ) ?? []
          )
        : [];

      const upcInFamily =
        upcMatches.filter(p =>
          matchingFamily.some(
            f => f.id === p.id
          )
        );

      const upcConflict =
        upcMatches.length > 0 &&
        (
          upcInFamily.length !== 1 ||
          upcMatches.length !== 1
        );

      let candidates: Product[] = [];
      let method = "none";

      if (
        upcInFamily.length === 1 &&
        !upcConflict
      ) {
        candidates = upcInFamily;
        method = "upc";
      } else if (
        !upcConflict &&
        size &&
        width
      ) {
        candidates =
          matchingFamily.filter(p =>
            same(p.size, size) &&
            same(p.width, width)
          );

        if (color) {
          candidates =
            candidates.filter(p =>
              same(p.color, color)
            );

          method =
            "name_size_width_color";
        } else {
          method =
            "parent_size_width";
        }
      }

      candidates =
        uniqueProducts(candidates);

      const selected =
        candidates.length === 1
          ? candidates[0]
          : null;

      const contradicts =
        Boolean(
          selected &&
          (
            (
              size &&
              !same(
                selected.size,
                size
              )
            ) ||
            (
              width &&
              !same(
                selected.width,
                width
              )
            ) ||
            (
              color &&
              !same(
                selected.color,
                color
              )
            )
          )
        );

      const category =
        upcConflict || contradicts
          ? "needs_manual_review"
          : matchingFamily.length === 0
            ? "missing_catalog_shoe"
            : selected
              ? "exact_product_candidate"
              : "unresolved_known_shoe";

      return {
        saleId: item.saleId,
        lineId: item.lineId,
        title: item.title,
        sku,
        barcode,
        hikeProductId:
          item.variantId,
        parentId:
          actualParentId,
        approvedParentId:
          approved.hike_parent_id,
        approvedShoe:
          approved.shoe_name,
        gender:
          approvedParts.gender,
        size,
        width,
        color,
        quantity:
          item.quantity,
        category,
        method,
        reason:
          upcConflict
            ? "UPC conflicts with approved family or duplicates"
            : contradicts
              ? "UPC conflicts with Hike variant details"
              : selected
                ? "One matching Feldryva product; diagnostic only"
                : matchingFamily.length === 0
                  ? "Approved shoe not yet imported into Feldryva"
                  : "No unique exact variant match in Feldryva",
        matchingProductIds:
          candidates.map(p => p.id)
      };
    });

    const categories = [
      "exact_product_candidate",
      "unresolved_known_shoe",
      "missing_catalog_shoe",
      "excluded_merchandise",
      "needs_manual_review"
    ];

    return NextResponse.json({
      success: true,
      mode: "read_only",
      diagnosticOnly: true,
      syncEnabled:
        settings.enabled,
      liveMode:
        settings.live_mode,
      salesCutoff:
        settings.sales_cutoff,
      approvedParents:
        master.length,
      catalogProducts:
        products.length,
      salesRetrieved:
        sales.length,
      completedSales:
        completed.length,
      lineItemsChecked:
        results.length,
      classificationCounts:
        categories.map(category => ({
          category,
          count:
            results.filter(
              r =>
                r.category ===
                category
            ).length
        })),
      samples:
        Object.fromEntries(
          categories.map(category => [
            category,
            results.filter(
              r =>
                r.category ===
                category
            ).slice(0, 10)
          ])
        ),
      recordsWritten: 0,
      inventoryChanged: false
    });
  } catch (error) {
    console.error(
      "Hike processor diagnostic:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Hike diagnostic failed",
        detail:
          error instanceof Error
            ? error.message
            : "Unknown error"
      },
      {
        status: 500
      }
    );
  }
}
