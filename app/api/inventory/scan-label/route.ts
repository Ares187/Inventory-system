
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { inspectShoeLabel, readPrintedGtin } from "../../../../lib/shoe-label-image";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

async function findSavedShoe(upc: string) {
  try {
    const db = getSupabaseAdmin();
    const gtin = upc.padStart(14, "0");
    // UPC-A and its zero-padded EAN/GTIN forms can identify the same variant.
    const barcodes = [gtin, gtin.slice(1), gtin.slice(2)].filter(
      (candidate) => candidate.padStart(14, "0") === gtin
    );
    const { data: variants, error: variantError } = await db
      .from("products")
      .select("upc,shoe_model_id,gender,size,width,color")
      .eq("active", true)
      .in("upc", barcodes)
      .limit(2);

    if (variantError) throw variantError;
    if (variants?.length !== 1) return null;

    const variant = variants[0];
    if (!variant.shoe_model_id || !variant.size || !variant.width || !variant.color ||
        !["Men", "Women", "Unisex"].includes(variant.gender)) {
      return null;
    }

    const { data: model, error: modelError } = await db
      .from("shoe_models")
      .select("id,brand,model,version")
      .eq("id", variant.shoe_model_id)
      .eq("active", true)
      .maybeSingle();

    if (modelError) throw modelError;
    if (!model) return null;

    return {
      approvedModelId: model.id,
      brand: model.brand,
      model: model.model,
      version: model.version,
      gender: variant.gender,
      size: variant.size,
      width: variant.width,
      color: variant.color,
      upc: variant.upc,
    };
  } catch (error) {
    console.warn("Saved shoe lookup failed:", error);
    return null;
  }
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

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Image required" },
        { status: 400 }
      );
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
      image.size > 8 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, or WebP image under 8 MB" },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const label = await inspectShoeLabel(bytes).catch((error: unknown) => {
      console.warn("Barcode image processing failed:", error);
      return null;
    });

    if (label) {
      const saved = await findSavedShoe(label.upc);
      if (saved) return NextResponse.json({ success: true, shoe: saved });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Image recognition is not configured" },
        { status: 503 }
      );
    }

    const dataUrl = `data:${image.type};base64,${bytes.toString("base64")}`;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Read running shoe box labels.

Return a JSON object containing:
brand, model, version, gender, size, width, color, upc.

Read these fields independently from the main label and its box. If a second image is supplied, it is a closer view of the same photo. Use it to read small print while keeping the full photo for context:
- UPC: Read the printed digits next to the main retail barcode, including any outer digits and leading zeros. Digits may be vertical or separated by spaces. Return them as a string. Exclude supplemental barcodes, QR codes, and style codes. If the retail barcode digits are unreadable, return null.
- Color: Copy the printed color name verbatim, including components separated by slashes. It may be in small type below the style number. If only a clearly marked colorway code is printed, return that code (for example SCCG in HOKA style/color "1176572 / SCCG"). Do not infer color from the shoe illustration.
- Brand, model, version: Keep model qualifiers such as Trail, Elite, and GTX. "M CLIFTON 11" is Hoka, Clifton, 11. "Fresh Foam X 860v15" is New Balance, 860, 15. Do not substitute a style code for the model.
- Gender and size: Return Men, Women, or Unisex and the primary US size. A secondary size conversion does not mean Unisex.
- Width: Return the explicit word when present, otherwise the printed code (such as D or 2E). For "MEDIUM / B", return "Medium". For a combined size like 7.5D, return size 7.5 and width D. W next to a women's icon indicates Women.
Ignore adjacent labels. Return null only for the individual field that is missing or unreadable.
Return JSON only.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the shoe information from this box label.",
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "high",
              },
            },
            ...(label ? [{
              type: "image_url" as const,
              image_url: {
                url: `data:image/jpeg;base64,${label.crop.toString("base64")}`,
                detail: "high" as const,
              },
            }] : []),
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No recognition result");
    }

    const result = JSON.parse(content);
    // Prefer the barcode read directly from its bars.
    const upc = label?.upc ?? readPrintedGtin(result.upc);
    const saved = !label && upc ? await findSavedShoe(upc) : null;
    return NextResponse.json({
      success: true,
      shoe: saved ?? { ...result, upc, approvedModelId: null },
    });
  } catch (error) {
    console.error("Shoe label scanning failed:", error);

    return NextResponse.json(
      { error: "Unable to read shoe label" },
      { status: 500 }
    );
  }
}
