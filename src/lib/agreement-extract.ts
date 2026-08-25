import {
  emptyCovenantTerms,
  emptyDebtTerms,
  type CovenantTermsDraft,
  type DebtTermsDraft,
  type ExtractionResult,
  type FieldConfidence,
} from "./agreement-terms";

function notePush(notes: string[], msg: string) {
  notes.push(msg);
}

function toIsoDate(raw: string): string | undefined {
  const cleaned = raw.replace(/,/g, "").trim();
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function parseMoneyToDollars(raw: string): string | undefined {
  const lower = raw.toLowerCase().replace(/,/g, "").trim();
  const million = lower.match(/([\d.]+)\s*(million|mm)\b/);
  if (million) {
    const n = Number(million[1]) * 1_000_000;
    return Number.isFinite(n) ? n.toFixed(2) : undefined;
  }
  const billion = lower.match(/([\d.]+)\s*(billion|bn)\b/);
  if (billion) {
    const n = Number(billion[1]) * 1_000_000_000;
    return Number.isFinite(n) ? n.toFixed(2) : undefined;
  }
  const plain = lower.match(/\$?\s*([\d]+(?:\.\d{1,2})?)/);
  if (plain) return plain[1];
  return undefined;
}

function percentToBps(pct: string): string | undefined {
  const n = Number(pct);
  if (!Number.isFinite(n)) return undefined;
  return String(Math.round(n * 100));
}

/**
 * Heuristic extraction of debt facility terms from agreement text.
 */
export function extractDebtTermsHeuristic(text: string): ExtractionResult<DebtTermsDraft> {
  const terms = emptyDebtTerms();
  const confidence: FieldConfidence = {};
  const notes: string[] = [];
  const t = text.replace(/\s+/g, " ");

  if (/revolving\s+credit|revolving\s+facility|revolver/i.test(t)) {
    terms.type = "REVOLVER";
    confidence.type = 0.75;
    notePush(notes, "Detected revolving facility language → REVOLVER.");
  } else if (/senior\s+notes|indenture/i.test(t)) {
    terms.type = "SENIOR_NOTES";
    confidence.type = 0.7;
  } else if (/term\s+loan/i.test(t)) {
    terms.type = "TERM_LOAN";
    confidence.type = 0.7;
  } else if (/funding\s+agreement/i.test(t)) {
    terms.type = "FUNDING_AGREEMENT";
    confidence.type = 0.8;
  } else if (/preferred\s+stock|preferred\s+shares/i.test(t)) {
    terms.type = "PREFERRED";
    confidence.type = 0.65;
  }

  const principal =
    t.match(
      /(?:principal\s+amount|aggregate\s+principal|commitment|facility\s+amount|loan\s+amount)[^\d$]{0,40}(\$?[\d,.]+(?:\s*(?:million|mm|billion|bn))?)/i,
    ) ?? t.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:principal|commitment)/i);
  if (principal) {
    const dollars = parseMoneyToDollars(principal[1] ?? principal[0]);
    if (dollars) {
      terms.principalDollars = dollars;
      if (terms.type === "REVOLVER") terms.commitmentDollars = dollars;
      confidence.principalDollars = 0.7;
    }
  }

  const maturity =
    t.match(
      /(?:maturity\s+date|matures?\s+on|final\s+maturity)[^\dA-Za-z]{0,20}([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
    ) ?? null;
  if (maturity?.[1]) {
    const iso = toIsoDate(maturity[1]);
    if (iso) {
      terms.maturityDate = iso;
      confidence.maturityDate = 0.75;
    }
  }

  const issue =
    t.match(
      /(?:dated\s+as\s+of|closing\s+date|effective\s+date|issue\s+date)[^\dA-Za-z]{0,20}([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
    ) ?? null;
  if (issue?.[1]) {
    const iso = toIsoDate(issue[1]);
    if (iso) {
      terms.issueDate = iso;
      confidence.issueDate = 0.7;
    }
  }

  if (/SOFR/i.test(t)) {
    terms.rateType = "FLOATING";
    terms.indexName = "SOFR";
    confidence.rateType = 0.85;
    confidence.indexName = 0.9;
  } else if (/LIBOR|Term SOFR|base rate/i.test(t) && /spread|margin/i.test(t)) {
    terms.rateType = "FLOATING";
    confidence.rateType = 0.7;
    if (/Term\s*SOFR/i.test(t)) terms.indexName = "SOFR";
  }

  const spread =
    t.match(
      /(?:margin|spread)\s*(?:of|equal\s+to|:)?\s*([\d.]+)\s*(?:%|percent|per\s+cent|bps|basis\s+points)/i,
    ) ?? t.match(/SOFR\s*\+\s*([\d.]+)\s*%/i);
  if (spread?.[1]) {
    const raw = spread[1];
    const unit = spread[0].toLowerCase();
    if (unit.includes("bps") || unit.includes("basis")) {
      terms.spreadBps = String(Math.round(Number(raw)));
    } else {
      terms.spreadBps = percentToBps(raw);
    }
    terms.rateType = "FLOATING";
    confidence.spreadBps = 0.8;
  }

  const fixed =
    t.match(
      /(?:fixed\s+(?:interest\s+)?rate|coupon(?:\s+rate)?)\s*(?:of|equal\s+to|:)?\s*([\d.]+)\s*%/i,
    ) ?? null;
  if (fixed?.[1] && !terms.spreadBps) {
    terms.rateType = "FIXED";
    terms.fixedRateBps = percentToBps(fixed[1]);
    confidence.fixedRateBps = 0.75;
    confidence.rateType = 0.8;
  }

  const floor = t.match(/floor\s*(?:of|:)?\s*([\d.]+)\s*%/i);
  if (floor?.[1]) {
    terms.floorBps = percentToBps(floor[1]);
    confidence.floorBps = 0.7;
  }

  if (/actual\/360|act\/360|act_360/i.test(t)) {
    terms.dayCount = "ACT_360";
    confidence.dayCount = 0.9;
  } else if (/actual\/365|act\/365/i.test(t)) {
    terms.dayCount = "ACT_365";
    confidence.dayCount = 0.9;
  } else if (/30\/360|thirty\/360/i.test(t)) {
    terms.dayCount = "THIRTY_360";
    confidence.dayCount = 0.9;
  }

  if (/semi[- ]?annual/i.test(t)) {
    terms.paymentFrequency = "SEMI_ANNUAL";
    confidence.paymentFrequency = 0.7;
  } else if (/quarterly/i.test(t)) {
    terms.paymentFrequency = "QUARTERLY";
    confidence.paymentFrequency = 0.75;
  } else if (/monthly/i.test(t)) {
    terms.paymentFrequency = "MONTHLY";
    confidence.paymentFrequency = 0.65;
  } else if (/annual(?:ly)?\s+(?:interest|payment)/i.test(t)) {
    terms.paymentFrequency = "ANNUAL";
    confidence.paymentFrequency = 0.65;
  }

  if (terms.rateType === "FLOATING") {
    terms.resetFrequency = terms.paymentFrequency ?? "QUARTERLY";
  }

  const lender =
    t.match(
      /(?:lender|administrative\s+agent|issuer|counterparty)\s*[:\-]\s*([A-Z][A-Za-z0-9&.,'\-]+(?:\s+[A-Z][A-Za-z0-9&.,'\-]+){0,5})/i,
    ) ?? null;
  if (lender?.[1]) {
    // Stop before common following labels that are title-cased
    const raw = lender[1]
      .replace(/\s+(Principal|Maturity|Interest|Commitment|Facility|Dated|Effective)\b[\s\S]*$/i, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
    if (raw) {
      terms.counterparty = raw;
      confidence.counterparty = 0.55;
      notePush(notes, "Counterparty guessed from lender/agent language — verify.");
    }
  }

  const titleMatch = text
    .slice(0, 800)
    .match(
      /(CREDIT AGREEMENT|FUNDING AGREEMENT|TERM LOAN AGREEMENT|NOTE PURCHASE AGREEMENT|INDENTURE|REVOLVING CREDIT AGREEMENT)[^\n]{0,80}/i,
    );
  if (titleMatch) {
    terms.name = titleMatch[0].replace(/\s+/g, " ").trim().slice(0, 120);
    confidence.name = 0.55;
  }

  const unusedFee = t.match(
    /(?:commitment\s+fee|unused\s+fee|facility\s+fee)\s*(?:of|equal\s+to|:)?\s*([\d.]+)\s*(?:%|bps|basis)/i,
  );
  if (unusedFee?.[1]) {
    const unit = unusedFee[0].toLowerCase();
    terms.unusedFeeRateBps =
      unit.includes("bps") || unit.includes("basis")
        ? String(Math.round(Number(unusedFee[1])))
        : percentToBps(unusedFee[1]);
    confidence.unusedFeeRateBps = 0.65;
  }

  if (notes.length === 0) {
    notePush(notes, "Heuristic parse complete. Review every field before approving.");
  }

  return { terms, confidence, notes, method: "heuristic" };
}

/**
 * Heuristic extraction of financial covenant definitions from agreement text.
 */
export function extractCovenantTermsHeuristic(text: string): ExtractionResult<CovenantTermsDraft> {
  const terms = emptyCovenantTerms();
  const confidence: FieldConfidence = {};
  const notes: string[] = [];
  const definitions: CovenantTermsDraft["definitions"] = [];
  const t = text.replace(/\s+/g, " ");

  const packageMatch = text
    .slice(0, 600)
    .match(/(CREDIT AGREEMENT|INDENTURE|FINANCING AGREEMENT|FACILITY AGREEMENT)[^\n]{0,60}/i);
  if (packageMatch) {
    terms.packageName = packageMatch[0].replace(/\s+/g, " ").trim().slice(0, 120);
    confidence.packageName = 0.5;
  }

  const leverage =
    t.match(
      /(?:maximum\s+)?(?:consolidated\s+)?(?:total\s+)?leverage\s+ratio[^\d]{0,40}(?:not\s+(?:to\s+)?exceed|shall\s+not\s+exceed|≤|<=|less\s+than\s+or\s+equal\s+to|:)?\s*([\d.]+)\s*(?:to\s*1|:1|x)?/i,
    ) ?? null;
  if (leverage?.[1]) {
    definitions.push({
      name: "Maximum leverage ratio",
      metricKey: "leverage",
      operator: "lte",
      threshold: leverage[1],
      frequency: /quarterly/i.test(t) ? "quarterly" : "quarterly",
      notes: "Extracted from leverage ratio covenant language.",
    });
    confidence["definitions.0.threshold"] = 0.75;
  }

  const coverage =
    t.match(
      /(?:minimum\s+)?(?:consolidated\s+)?interest\s+coverage\s+ratio[^\d]{0,40}(?:at\s+least|not\s+less\s+than|≥|>=|:)?\s*([\d.]+)\s*(?:to\s*1|:1|x)?/i,
    ) ?? null;
  if (coverage?.[1]) {
    definitions.push({
      name: "Minimum interest coverage",
      metricKey: "interest_coverage",
      operator: "gte",
      threshold: coverage[1],
      frequency: "quarterly",
      notes: "Extracted from interest coverage covenant language.",
    });
    confidence[`definitions.${definitions.length - 1}.threshold`] = 0.75;
  }

  const debtCapital =
    t.match(
      /debt[- ]to[- ]capital(?:ization)?\s+ratio[^\d]{0,40}(?:not\s+(?:to\s+)?exceed|shall\s+not\s+exceed|≤|<=|:)?\s*([\d.]+)/i,
    ) ?? null;
  if (debtCapital?.[1]) {
    definitions.push({
      name: "Debt to capital",
      metricKey: "debt_to_capital",
      operator: "lte",
      threshold: debtCapital[1],
      frequency: "quarterly",
      notes: "Extracted from debt-to-capital covenant language.",
    });
  }

  if (definitions.length === 0) {
    definitions.push({
      name: "Covenant (review required)",
      metricKey: "leverage",
      operator: "lte",
      threshold: "",
      frequency: "quarterly",
      notes: "No clear numeric covenant found — complete manually from the PDF.",
    });
    notePush(notes, "No leverage/coverage thresholds matched; template left blank for review.");
  } else {
    notePush(notes, `Found ${definitions.length} covenant definition(s). Confirm thresholds and operators.`);
  }

  terms.definitions = definitions;
  return { terms, confidence, notes, method: "heuristic" };
}

type LlmDebtShape = Partial<DebtTermsDraft>;
type LlmCovenantShape = Partial<CovenantTermsDraft>;

async function callOpenAiJson<T>(system: string, user: string): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user.slice(0, 100_000) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI extraction failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content) as T;
}

function mergeDefined<T extends Record<string, unknown>>(base: T, overlay: Partial<T>): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined || v === null || v === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function analyzeDebtAgreementText(
  text: string,
): Promise<ExtractionResult<DebtTermsDraft>> {
  const heuristic = extractDebtTermsHeuristic(text);
  try {
    const llm = await callOpenAiJson<LlmDebtShape>(
      `You extract debt facility terms from legal agreement text for an accounting system.
Return JSON only with keys: name, instrumentNumber, type (FUNDING_AGREEMENT|TERM_LOAN|REVOLVER|SENIOR_NOTES|PREFERRED|OTHER),
counterparty, issueDate (yyyy-MM-dd), maturityDate (yyyy-MM-dd), principalDollars, commitmentDollars,
issuanceCostsDollars, unusedFeeRateBps, rateType (FIXED|FLOATING), fixedRateBps, indexName, spreadBps,
indexFixingBps, floorBps, paymentFrequency (MONTHLY|QUARTERLY|SEMI_ANNUAL|ANNUAL),
resetFrequency (same enum), dayCount (ACT_360|ACT_365|THIRTY_360), covenantNotes.
Use strings for all numeric fields. Omit unknown keys. Rates in basis points (5.25% = "525").`,
      text,
    );
    if (!llm) return heuristic;
    return {
      terms: mergeDefined(heuristic.terms, llm),
      confidence: { ...heuristic.confidence, _llm: 0.85 },
      notes: [...heuristic.notes, "Enriched with OpenAI extraction (OPENAI_API_KEY)."],
      method: "heuristic+llm",
    };
  } catch (e) {
    return {
      ...heuristic,
      notes: [
        ...heuristic.notes,
        `LLM enrichment skipped: ${e instanceof Error ? e.message : "unknown error"}`,
      ],
    };
  }
}

export async function analyzeCovenantAgreementText(
  text: string,
): Promise<ExtractionResult<CovenantTermsDraft>> {
  const heuristic = extractCovenantTermsHeuristic(text);
  try {
    const llm = await callOpenAiJson<LlmCovenantShape>(
      `You extract financial covenant definitions from a credit agreement.
Return JSON: { "packageName": string, "definitions": [{ "name", "metricKey" (leverage|interest_coverage|debt_to_capital|other snake_case),
"threshold" (string number), "operator" (lte|gte), "frequency" (quarterly|monthly|annual), "notes" }] }.
Omit unknowns. Prefer numeric thresholds only.`,
      text,
    );
    if (!llm) return heuristic;
    const definitions =
      Array.isArray(llm.definitions) && llm.definitions.length > 0
        ? llm.definitions
        : heuristic.terms.definitions;
    return {
      terms: {
        packageName: llm.packageName ?? heuristic.terms.packageName,
        entityId: llm.entityId ?? heuristic.terms.entityId,
        definitions,
      },
      confidence: { ...heuristic.confidence, _llm: 0.85 },
      notes: [...heuristic.notes, "Enriched with OpenAI extraction (OPENAI_API_KEY)."],
      method: "heuristic+llm",
    };
  } catch (e) {
    return {
      ...heuristic,
      notes: [
        ...heuristic.notes,
        `LLM enrichment skipped: ${e instanceof Error ? e.message : "unknown error"}`,
      ],
    };
  }
}
