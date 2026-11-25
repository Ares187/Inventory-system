import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  NotFoundException,
  RGBLuminanceSource,
} from "@zxing/library";
import sharp from "sharp";

export function readPrintedGtin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.trim().replace(/[\s-]+/g, "");
  if (!/^\d{12,14}$/.test(digits)) return null;

  const sum = [...digits].reverse().reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
    0
  );
  return sum % 10 === 0 ? digits : null;
}

export async function inspectShoeLabel(bytes: Buffer) {
  const { data: image, info } = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .autoOrient()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });

  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.UPC_A, BarcodeFormat.EAN_13]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new MultiFormatOneDReader(hints);

  for (const angle of [0, 90]) {
    const { data, info: rotated } = await sharp(image)
      .rotate(angle)
      .removeAlpha()
      .toColourspace("b-w")
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminance = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    const source = new RGBLuminanceSource(luminance, rotated.width, rotated.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    try {
      const result = reader.decode(bitmap, hints);
      const points = result.getResultPoints();
      const barcodeCenterY = points.reduce(
        (sum, point) => sum + (angle === 90 ? info.height - 1 - point.getX() : point.getY()),
        0
      ) / points.length;

      // Keep the full label width because the model and barcode may sit at opposite ends.
      const height = Math.ceil(info.height / 2);
      const top = Math.max(0, Math.min(
        info.height - height,
        Math.round(barcodeCenterY - height / 2)
      ));
      const crop = await sharp(image)
        .extract({ left: 0, top, width: info.width, height })
        .jpeg({ quality: 92 })
        .toBuffer();

      return { upc: result.getText(), crop };
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
  }

  return null;
}
