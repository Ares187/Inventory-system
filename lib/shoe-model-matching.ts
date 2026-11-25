
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

function normalizeBrand(value: string): string {
  return normalize(value).replace(/^hokaoneone$/, "hoka").replace(/^onrunning$/, "on");
}

function normalizeVersion(value: string): string {
  return value.replace(/^v(?=\d)/i, "").replace(/^0+(?=\d)/, "");
}

function parseModel(
  model: string,
  brand: string,
  version?: string | null
): { name: string; version: string } {
  const genderPrefix = /^(?:m|w|men(?:['’]?s)?|women(?:['’]?s)?|unisex)[\s:/-]+/i;
  const labelWithoutGender = model.trim().replace(genderPrefix, "");
  const brandPrefix = /^(hoka(?:[\s-]+one[\s-]+one)?|new[\s-]*balance|nike|mizuno|asics|brooks|saucony|on)[\s:/-]+/i;
  let label = labelWithoutGender.replace(brandPrefix, (prefix, name: string) =>
    normalizeBrand(name) === brand ? "" : prefix
  ).replace(genderPrefix, "");
  if (brand === "newbalance") {
    label = label.replace(/^(?:new[\s-]+balance[\s-]+)?fresh[\s-]+foam(?:[\s-]+x\b)?[\s-]+/i, "");
  }

  const explicitVersion = normalizeVersion((version ?? "").trim());
  const embedded = label.match(/^(.+?)(?:\s*[- ]?\s*v?(\d+))$/i);
  // All-digit names such as 860 are model names unless followed by a version.
  const suffix = embedded && !/^\d+$/.test(label) ? embedded : null;
  if (suffix && explicitVersion && normalizeVersion(suffix[2]) !== explicitVersion) {
    return { name: normalize(label), version: explicitVersion };
  }

  return {
    name: normalize(suffix?.[1] ?? label),
    version: explicitVersion || (suffix ? normalizeVersion(suffix[2]) : ""),
  };
}

export function matchApprovedModel(
  recognized: RecognizedShoe,
  approvedModels: ApprovedShoeModel[]
): ApprovedShoeModel | null {
  const recognizedBrand = normalizeBrand(recognized.brand);
  const recognizedModel = parseModel(
    recognized.model,
    recognizedBrand,
    recognized.version
  );

  const matches = approvedModels.filter((approved) => {
    if (normalizeBrand(approved.brand) !== recognizedBrand) {
      return false;
    }

    const catalogModel = parseModel(
      approved.model,
      recognizedBrand,
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
