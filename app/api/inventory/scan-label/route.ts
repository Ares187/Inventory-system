
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getLoggedInEmployee } from "../../../../lib/employee-session";

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

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Image recognition is not configured" },
        { status: 503 }
      );
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const dataUrl =
      `data:${image.type};base64,${bytes.toString("base64")}`;

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

Read these fields independently from the main label and its box:
- UPC: Read the printed digits next to the main retail barcode, including any outer digits and leading zeros. Digits may be vertical or separated by spaces. Return them as a string. Exclude supplemental barcodes, QR codes, and style codes. If the retail barcode digits are unreadable, return null.
- Color: Copy the printed color name verbatim. If only a clearly marked colorway code is printed, return that code (for example SCCG in HOKA style/color "1176572 / SCCG"). Do not infer color from the shoe illustration.
- Brand, model, version: Keep model qualifiers such as Trail, Elite, and GTX. "M CLIFTON 11" is Hoka, Clifton, 11. "Fresh Foam X 860v15" is New Balance, 860, 15. Do not substitute a style code for the model.
- Gender and size: Return Men, Women, or Unisex and the primary US size. A secondary size conversion does not mean Unisex.
- Width: Copy the explicit word (such as Wide) or printed code (such as D or 2E). For a combined size like 7.5D, return size 7.5 and width D. W next to a women's icon indicates Women.
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
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No recognition result");
    }

    const result = JSON.parse(content);
    console.log("SCANNED SHOE DATA:", result);
    return NextResponse.json({
      success: true,
      shoe: result,
    });
  } catch (error) {
    console.error("Shoe label scanning failed:", error);

    return NextResponse.json(
      { error: "Unable to read shoe label" },
      { status: 500 }
    );
  }
}
