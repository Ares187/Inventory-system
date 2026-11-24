
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

Rules:
- Use only information visible in the photograph.
- Use US shoe size, not UK or EUR.
- Gender must be Men, Women, or Unisex.
- Normalize B/Medium women's width to Regular.
- Normalize D/Medium men's width to Regular.
- Preserve the manufacturer's color description.
- Read the model name even when the label starts with a cushioning or marketing name.
- For New Balance "Fresh Foam X 860v15", return brand "New Balance", model "860", and version "15". Fresh Foam X is cushioning branding.
- Keep distinguishing model words such as Trail, Elite, or GTX. Use printed model names over style codes.
- Use the primary US size and gender printed on the label when a secondary conversion is also shown.
- Never invent missing values.
- UPC must be read from the retail barcode or its printed digits.
- UPC-A contains 12 digits; EAN-13 contains 13 digits.
- Barcode digits may be printed vertically or separated into groups.
- Combine all digits belonging to the same barcode in their printed order.
- Never use manufacturer style codes, SKUs, or color codes as the UPC.
- Codes containing letters are not UPCs.
- If the barcode digits cannot be read confidently, return null for upc.
- If any field is uncertain, return null for that field.
- Return exactly one shoe label.
- Do not guess a UPC from unclear barcode lines.
- Return JSON only.`,
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
