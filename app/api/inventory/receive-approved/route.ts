
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { getLoggedInEmployee } from "../../../../lib/employee-session";

type ShoeModel = {
  id: number;
  brand: string;
  model: string;
  version: string | null;
};

type HikeParent = {
  hike_product_id: string;
  sku: string | null;
  product_name: string | null;
};

type MasterRow = {
  hike_parent_id: string;
  parent_sku: string;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeGender(value: unknown): string {
  const text = normalize(value);

  if (["men", "mens", "male", "m"].includes(text)) {
    return "m";
  }

  if (["women", "womens", "female", "w"].includes(text)) {
    return "w";
  }

  return "";
}

function normalizeVersionTokens(value: string): string {
  return value
    .split(" ")
    .map(token => token.replace(/^v(?=\d)/, ""))
    .join(" ");
}

function modelIdentity(model: ShoeModel): string {
  const name = normalize(model.model);
  const version = normalizeVersionTokens(
    normalize(model.version)
  );

  if (!version) return normalizeVersionTokens(name);

  const normalizedName = normalizeVersionTokens(name);
  const nameTokens = normalizedName.split(" ");
  const lastToken = nameTokens[nameTokens.length - 1];

  // Avoid adding the version twice if the model
  // name already includes it.
  if (lastToken === version) {
    return normalizedName;
  }

  return `${normalizedName} ${version}`;
}

function matchesHikeParent(
  hikeName: string,
  shoeModel: ShoeModel,
  gender: string
): boolean {
  const name = normalize(hikeName);

  if (!name) return false;

  const expectedGender = gender === "m" ? "m" : "w";
  const tokens = name.split(" ");

  // Gender must match exactly.
  if (tokens[0] !== expectedGender) {
    return false;
  }

  const hikeIdentity = normalizeVersionTokens(
    tokens.slice(1).join(" ")
  );

  const targetIdentity = modelIdentity(shoeModel);
  const brand = normalize(shoeModel.brand);

  // Require exact model/version, allowing an
  // optional brand prefix in Hike's name.
  return (
    hikeIdentity === targetIdentity ||
    hikeIdentity === `${brand} ${targetIdentity}`
  );
}

async function associateHikeParent(
  db: ReturnType<typeof getSupabaseAdmin>,
  shoeModelId: number,
  genderInput: string
) {
  const gender = normalizeGender(genderInput);

  if (!gender) {
    return {
      status: "review_required",
      reason: "Gender cannot be matched to Hike"
    };
  }

  const { data: shoeModel, error: modelError } = await db
    .from("shoe_models")
    .select("id,brand,model,version")
    .eq("id", shoeModelId)
    .single();

  if (modelError || !shoeModel) {
    return {
      status: "review_required",
      reason: "Approved shoe model could not be found"
    };
  }

  const model = shoeModel as ShoeModel;

  // Check whether this model and gender already
  // have an approved Hike parent.
  const { data: master, error: masterError } = await db
    .from("hike_shoe_master")
    .select("hike_parent_id,parent_sku,shoe_name");

  if (masterError) throw masterError;

  const existing = (master ?? []).filter(row =>
    matchesHikeParent(
      String(row.shoe_name ?? ""),
      model,
      gender
    )
  );

  if (existing.length === 1) {
    return {
      status: "already_registered",
      hikeParentId: existing[0].hike_parent_id
    };
  }

  if (existing.length > 1) {
    return {
      status: "review_required",
      reason: "Multiple existing master entries match this shoe"
    };
  }

  // Search Hike's imported parent records.
  // Broad search first, exact matching afterward.
  const modelSearch = normalize(model.model).replace(
    /[%_,]/g,
    ""
  );

  if (!modelSearch) {
    return {
      status: "review_required",
      reason: "Shoe model has no searchable name"
    };
  }

  const candidates: HikeParent[] = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("hike_product_index")
      .select("hike_product_id,sku,product_name")
      .eq("hike_variant_id", "")
      .ilike("product_name", `%${modelSearch}%`)
      .order("id")
      .range(offset, offset + 999);

    if (error) throw error;

    candidates.push(...((data ?? []) as HikeParent[]));

    if (!data || data.length < 1000) break;
  }

  const matches = candidates.filter(candidate =>
    matchesHikeParent(
      String(candidate.product_name ?? ""),
      model,
      gender
    ) &&
    Boolean(candidate.sku) &&
    Boolean(candidate.hike_product_id)
  );

  const uniqueMatches = [
    ...new Map(
      matches.map(item => [item.hike_product_id, item])
    ).values()
  ];

  if (uniqueMatches.length !== 1) {
    return {
      status: "review_required",
      reason:
        uniqueMatches.length === 0
          ? "No exact Hike parent match found"
          : "Multiple Hike parents match this shoe",
      matchCount: uniqueMatches.length
    };
  }

  const match = uniqueMatches[0];

  // Prevent duplicate master entries.
  const existingIds = new Set(
    (master as MasterRow[]).map(row =>
      String(row.hike_parent_id)
    )
  );

  const existingSkus = new Set(
    (master as MasterRow[]).map(row =>
      String(row.parent_sku)
    )
  );

  if (
    existingIds.has(match.hike_product_id) ||
    existingSkus.has(String(match.sku))
  ) {
    return {
      status: "review_required",
      reason:
        "Hike parent or SKU already belongs to another master entry"
    };
  }

  const { error: insertError } = await db
    .from("hike_shoe_master")
    .insert({
      parent_sku: match.sku,
      shoe_name: match.product_name,
      hike_parent_id: match.hike_product_id,
      source: "feldryva_receiving"
    });

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        status: "review_required",
        reason:
          "Hike parent was registered concurrently; verify association"
      };
    }

    throw insertError;
  }

  return {
    status: "registered",
    hikeParentId: match.hike_product_id,
    parentSku: match.sku
  };
}

export async function POST(request: Request) {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const shoeModelId = Number(body.shoeModelId);
    const storeId = Number(body.storeId);
    const quantity = Number(body.quantity);

    const gender = body.gender;
    const size = body.size;
    const width = body.width;
    const color = body.color;
    const upc = body.upc;

    const errors: string[] = [];

    if (!Number.isSafeInteger(shoeModelId) || shoeModelId <= 0) {
      errors.push("Invalid shoe model ID");
    }

    if (!Number.isSafeInteger(storeId) || storeId <= 0) {
      errors.push("Invalid store ID");
    }

    if (typeof gender !== "string" || !gender.trim()) {
      errors.push("Invalid gender");
    }

    if (
      (typeof size !== "string" && typeof size !== "number") ||
      !String(size).trim()
    ) {
      errors.push("Invalid size");
    }

    if (typeof width !== "string" || !width.trim()) {
      errors.push("Invalid width");
    }

    if (typeof color !== "string" || !color.trim()) {
      errors.push("Invalid color");
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      errors.push("Invalid quantity");
    }

    if (upc != null && typeof upc !== "string") {
      errors.push("Invalid UPC type");
    }

    if (
      typeof upc === "string" &&
      upc.trim() !== "" &&
      !/^[0-9]{12,14}$/.test(upc.trim())
    ) {
      errors.push("Invalid UPC type");
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.join("; ") },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    const { data: approvedModel, error: modelError } = await db
      .from("shoe_models")
      .select("id")
      .eq("id", shoeModelId)
      .eq("active", true)
      .maybeSingle();

    if (modelError) throw modelError;
    if (!approvedModel) {
      return NextResponse.json({ error: "Choose a verified shoe model" }, { status: 400 });
    }

    // Existing stock-receiving operation.
    const { data, error } = await db.rpc(
      "receive_approved_shoe",
      {
        p_shoe_model_id: shoeModelId,
        p_store_id: storeId,
        p_gender: String(gender).trim(),
        p_size: String(size).trim(),
        p_width: String(width).trim(),
        p_color: String(color).trim(),
        p_quantity: quantity,
        p_upc:
          typeof upc === "string"
            ? upc.trim() || null
            : null,
        p_employee_id: employee.id
      }
    );

    if (error) {
      console.error("Receiving failed:", error.message);

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Stock was successfully received.
    // Hike association is a separate operation.
    let hikeAssociation: Record<string, unknown>;

    try {
      hikeAssociation = await associateHikeParent(
        db,
        shoeModelId,
        String(gender)
      );
    } catch (associationError) {
      console.error(
        "Hike association failed after successful receipt:",
        associationError
      );

      hikeAssociation = {
        status: "review_required",
        reason:
          "Hike association failed; stock was received successfully"
      };
    }

    return NextResponse.json({
      success: true,
      result: data,
      hikeAssociation
    });
  } catch (error) {
    console.error("Receiving API error:", error);

    return NextResponse.json(
      { error: "Unable to receive stock" },
      { status: 500 }
    );
  }
}
