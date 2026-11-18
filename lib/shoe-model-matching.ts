
export type ApprovedShoeModel = {
  id: number;
  brand: string;
  model: string;
  version: string | null;
};

export type RecognizedShoe = {
  brand: string;
  model: string;
  version?: string | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/gel[\s-]+/g, "gel")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeVersion(value: string): string {
  return value.replace(/^v(?=\d)/i, "").replace(/^0+(?=\d)/, "");
}

function parseModel(
  model: string,
  version?: string | null
): { name: string; version: string } {
  const combined = `${model} ${version ?? ""}`.trim();

  const match = combined.match(
    /^(.*?)(?:\s*[- ]?\s*v?(\d+))$/i
  );

  if (match) {
    return {
      name: normalize(match[1]),
      version: normalizeVersion(match[2]),
    };
  }

  return {
    name: normalize(combined),
    version: "",
  };
}

export function matchApprovedModel(
  recognized: RecognizedShoe,
  approvedModels: ApprovedShoeModel[]
): ApprovedShoeModel | null {
  const recognizedBrand = normalize(recognized.brand);
  const recognizedModel = parseModel(
    recognized.model,
    recognized.version
  );

  const matches = approvedModels.filter((approved) => {
    if (normalize(approved.brand) !== recognizedBrand) {
      return false;
    }

    const catalogModel = parseModel(
      approved.model,
      approved.version
    );

    return (
      catalogModel.name === recognizedModel.name &&
      catalogModel.version === recognizedModel.version
    );
  });

  // Never guess when multiple models match.
  return matches.length === 1 ? matches[0] : null;
}
