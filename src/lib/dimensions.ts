export type GlDimensions = {
  companyCode: string;
  segmentCode: string;
  costCenter: string;
  productLine: string;
  intercompany: string;
  projectCode: string;
};

export const EMPTY_DIMENSIONS: GlDimensions = {
  companyCode: "",
  segmentCode: "",
  costCenter: "",
  productLine: "",
  intercompany: "",
  projectCode: "",
};

/** Prefer explicit values, then mapping defaults, then entity defaults. */
export function mergeDimensions(
  ...layers: Array<Partial<GlDimensions> | null | undefined>
): GlDimensions {
  const out = { ...EMPTY_DIMENSIONS };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of Object.keys(out) as (keyof GlDimensions)[]) {
      const v = layer[key];
      if (v != null && String(v).trim() !== "") out[key] = String(v).trim();
    }
  }
  return out;
}

export function productLineForInstrumentType(type: string): string {
  switch (type) {
    case "FUNDING_AGREEMENT":
      return "FA";
    case "REVOLVER":
      return "RCF";
    case "SENIOR_NOTES":
      return "NOTES";
    case "TERM_LOAN":
      return "TERM";
    case "PREFERRED":
      return "PREF";
    default:
      return "DEBT";
  }
}
