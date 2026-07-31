import crypto from "crypto";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { callLLM } from "./utils/llmClient.js";
import { cleanText, safeJsonParse } from "./utils/helpers.js";
import {
  getSupabaseClient,
  saveValidationReport,
} from "./memory/supabaseMemory.js";

const VALIDATOR_BUCKET =
  process.env.SUPABASE_VALIDATOR_BUCKET || "athina-validator";
const VALIDATOR_REFERENCE_PREFIX = (
  process.env.SUPABASE_VALIDATOR_REFERENCE_PREFIX || "reference"
).replace(/^\/+|\/+$/g, "");
const VALIDATOR_UPLOAD_PREFIX = (
  process.env.SUPABASE_VALIDATOR_UPLOAD_PREFIX || "uploads"
).replace(/^\/+|\/+$/g, "");

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REFERENCE_CHARS_PER_CATEGORY = Number(
  process.env.VALIDATOR_MAX_REFERENCE_CHARS_PER_CATEGORY || 14000
);
const MAX_PROPOSAL_CHARS_PER_CATEGORY = Number(
  process.env.VALIDATOR_MAX_PROPOSAL_CHARS_PER_CATEGORY || 12000
);

const CATEGORIES = [
  {
    key: "legal",
    label: "Legal & Contractual",
    weight: 20,
    keywords: [
      "terms", "conditions", "liability", "indemnity", "warranty",
      "termination", "confidentiality", "governing law", "compliance",
      "intellectual property", "force majeure", "data protection",
    ],
  },
  {
    key: "finance",
    label: "Finance & Payment",
    weight: 15,
    keywords: [
      "payment", "invoice", "milestone", "credit", "tax", "vat",
      "currency", "cash flow", "financial", "budget", "retention",
    ],
  },
  {
    key: "pricing",
    label: "Pricing & Commercials",
    weight: 20,
    keywords: [
      "price", "pricing", "quotation", "rate", "cost", "total",
      "discount", "unit price", "quantity", "commercial", "validity",
      "one-time", "recurring", "subscription",
    ],
  },
  {
    key: "grammar",
    label: "Grammar & Presentation",
    weight: 10,
    keywords: [
      "grammar", "spelling", "style", "format", "clarity", "language",
      "professional", "consistency", "readability",
    ],
  },
  {
    key: "context",
    label: "Scope & Context",
    weight: 15,
    keywords: [
      "executive summary", "background", "objective", "scope",
      "deliverable", "assumption", "exclusion", "timeline", "acceptance",
      "stakeholder", "requirement", "out of scope",
    ],
  },
  {
    key: "architecture",
    label: "Technical Architecture",
    weight: 20,
    keywords: [
      "architecture", "design", "integration", "security", "network",
      "cloud", "availability", "backup", "disaster recovery", "sla",
      "capacity", "scalability", "migration", "deployment", "support",
    ],
  },
];

const CORE_CATEGORY_KEYS = new Set([
  "legal",
  "finance",
  "pricing",
  "context",
  "architecture",
]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was",
  "were", "have", "has", "had", "will", "shall", "would", "should",
  "about", "into", "over", "under", "their", "there", "where", "when",
  "your", "you", "our", "they", "them", "his", "her", "its", "not",
  "but", "can", "may", "also", "than", "then", "such", "any", "all",
  "each", "per", "via", "use", "using", "used", "proposal", "project",
  "solution", "services", "service", "client", "vendor", "scope", "work",
  "document",
]);

let referenceCache = { expiresAt: 0, files: [] };

const normalizeName = (value) => String(value || "").toLowerCase();
const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Number(value) || 0));
const trimForPrompt = (text, maxChars) =>
  String(text || "").slice(0, maxChars);

const detectCategory = (fileName, content = "") => {
  const text = `${normalizeName(fileName)} ${normalizeName(content).slice(0, 1800)}`;
  const scores = CATEGORIES.map((category) => ({
    key: category.key,
    score: category.keywords.reduce(
      (total, keyword) => total + (text.includes(keyword) ? 1 : 0),
      0
    ),
  })).sort((a, b) => b.score - a.score);

  return scores[0]?.score > 0 ? scores[0].key : "context";
};

const isReferenceCandidate = (path) => {
  const normalized = normalizeName(path);
  if (!normalized) return false;
  if (normalized.startsWith(`${normalizeName(VALIDATOR_UPLOAD_PREFIX)}/`)) {
    return false;
  }
  if (normalized.includes("/.")) return false;
  return /\.(pdf|docx|txt|md|json)$/i.test(normalized);
};

const ensureSupabase = () => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase is not configured for proposal validation.");
  }
  return client;
};

const hasLikelyServiceRoleKey = () => {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!key) return false;
  return !/^sb_(publishable|anon)_/i.test(key);
};

const detectKeyKind = () => {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!key) return "missing";
  if (/^sb_publishable_/i.test(key)) return "publishable";
  if (/^sb_anon_/i.test(key)) return "anon";
  if (/^sb_secret_/i.test(key)) return "secret";
  if (key.split(".").length === 3) return "jwt";
  return "unknown";
};

const toBuffer = async (blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const extractTextFromBuffer = async (
  buffer,
  fileName,
  mimeType = "application/octet-stream"
) => {
  const lowerName = normalizeName(fileName);
  if (!buffer?.length) return "";

  if (mimeType.includes("pdf") || lowerName.endsWith(".pdf")) {
    const parsed = await pdfParse(buffer);
    return cleanText(parsed.text || "");
  }

  if (mimeType.includes("word") || lowerName.endsWith(".docx")) {
    const parsed = await mammoth.extractRawText({ buffer });
    return cleanText(parsed.value || "");
  }

  return cleanText(buffer.toString("utf8"));
};

const tokenizeImportantTerms = (text, limit = 1600) => {
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  return new Set(tokens.slice(0, limit));
};

const normalizeNumberToken = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/percent/g, "%");

const extractNumericTokens = (text) => {
  const matches =
    String(text || "").match(
      /(?:aed|usd|eur|gbp|\$|€|£)?\s*\d+(?:[.,]\d+)?(?:\s*(?:k|m|b|%|percent|hours?|days?|weeks?|months?|years?))?/gi
    ) || [];
  return new Set(matches.map(normalizeNumberToken));
};

const jaccardSimilarity = (setA, setB) => {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
};

const overlapRatio = (subset, superset) => {
  if (!subset.size || !superset.size) return 0;
  let hits = 0;
  for (const item of subset) if (superset.has(item)) hits += 1;
  return hits / subset.size;
};

const splitIntoPassages = (text, maxPassageChars = 1200) => {
  const paragraphs = String(text || "")
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)
    .map((part) => cleanText(part))
    .filter((part) => part.length >= 40);

  const passages = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxPassageChars) {
      passages.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }
  if (current) passages.push(current);
  return passages;
};

const scorePassageForCategory = (passage, category, referenceTerms) => {
  const lower = passage.toLowerCase();
  const keywordHits = category.keywords.reduce(
    (sum, keyword) => sum + (lower.includes(keyword) ? 1 : 0),
    0
  );
  const terms = tokenizeImportantTerms(passage, 500);
  const referenceCoverage = overlapRatio(terms, referenceTerms);
  const numericBonus = extractNumericTokens(passage).size > 0 ? 0.25 : 0;
  return keywordHits * 2 + referenceCoverage * 10 + numericBonus;
};

const selectRelevantPassages = (
  text,
  category,
  referenceText,
  maxChars = MAX_PROPOSAL_CHARS_PER_CATEGORY
) => {
  const referenceTerms = tokenizeImportantTerms(referenceText, 1400);
  const ranked = splitIntoPassages(text)
    .map((passage, index) => ({
      passage,
      index,
      score: scorePassageForCategory(passage, category, referenceTerms),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = [];
  let used = 0;
  for (const item of ranked) {
    if (used + item.passage.length > maxChars) continue;
    chosen.push(item);
    used += item.passage.length;
    if (used >= maxChars * 0.9) break;
  }

  return chosen
    .sort((a, b) => a.index - b.index)
    .map((item) => item.passage)
    .join("\n\n");
};

const calculateEvidenceScore = (
  proposalText,
  categoryReferenceFiles,
  categoryKey
) => {
  const referenceText = categoryReferenceFiles
    .map((file) => file.content || "")
    .join("\n");
  const proposalTerms = tokenizeImportantTerms(proposalText);
  const referenceTerms = tokenizeImportantTerms(referenceText);
  const proposalNumbers = extractNumericTokens(proposalText);
  const referenceNumbers = extractNumericTokens(referenceText);

  const semanticOverlap = jaccardSimilarity(proposalTerms, referenceTerms);
  const proposalCoverage = overlapRatio(referenceTerms, proposalTerms);
  const numericOverlap = overlapRatio(referenceNumbers, proposalNumbers);
  const hasReferences = categoryReferenceFiles.length > 0;

  let score = 0;
  if (hasReferences) {
    score = Math.round(
      clamp(
        semanticOverlap * 45 +
          proposalCoverage * 35 +
          numericOverlap * 20
      )
    );
  }

  // Grammar is evaluated primarily from the proposal itself, not lexical
  // similarity to corporate reference documents.
  if (categoryKey === "grammar") score = 50;

  return {
    score,
    hasReferences,
    semanticOverlap,
    proposalCoverage,
    numericOverlap,
  };
};

const applyGrounding = (modelScore, evidence, categoryKey) => {
  const score = clamp(modelScore);

  // Missing reference coverage is not the same as proposal failure.
  // Grammar, context, and architecture can still be assessed for intrinsic quality.
  if (categoryKey === "grammar" || !evidence.hasReferences) {
    return Math.round(score);
  }

  // Deterministic overlap is supporting evidence, not an overriding verdict.
  // Keep the model assessment dominant and use overlap as a modest adjustment.
  return Math.round(clamp(score * 0.9 + evidence.score * 0.1));
};

const buildProposalDiagnostics = (text) => {
  const normalized = String(text || "").toLowerCase();
  const checks = [
    ["executive_summary", /executive summary|proposal overview|introduction/],
    ["objectives", /objectives?|business goals?|purpose/],
    ["scope", /scope of work|in scope|out of scope/],
    ["deliverables", /deliverables?|outputs?/],
    ["assumptions", /assumptions?/],
    ["exclusions", /exclusions?|out of scope/],
    ["timeline", /timeline|schedule|project plan|milestone/],
    ["pricing", /pricing|commercials?|quotation|total price|fees?/],
    ["payment_terms", /payment terms?|invoice|billing/],
    ["validity", /proposal validity|valid for|validity period/],
    ["legal_terms", /terms and conditions|liability|termination|indemnity/],
    ["architecture", /architecture|solution design|technical design/],
    ["security", /security|cybersecurity|data protection|encryption/],
    ["sla_support", /service level|sla|support model|maintenance/],
    ["acceptance", /acceptance criteria|sign-off|acceptance/],
  ];

  const sections = Object.fromEntries(
    checks.map(([key, pattern]) => [key, pattern.test(normalized)])
  );

  const wordCount = String(text || "").split(/\s+/).filter(Boolean).length;
  const numericCount = extractNumericTokens(text).size;
  const detectedCount = Object.values(sections).filter(Boolean).length;

  return {
    wordCount,
    numericCount,
    sections,
    detectedSectionCount: detectedCount,
    completenessPercent: Math.round((detectedCount / checks.length) * 100),
  };
};

const parseMoney = (value) =>
  Number(String(value || "").replace(/[^0-9.-]/g, ""));

const extractCommercialChecks = (text) => {
  const source = String(text || "");
  const checks = [];

  const excludingMatch = source.match(
    /total\s+excluding\s+vat\s*(?:\(aed\))?\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  const vatMatch = source.match(
    /vat\s*(?:[-–]\s*)?5%\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  const grandMatch = source.match(
    /grand\s+total(?:\s+including\s+vat)?\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i
  );

  const excluding = parseMoney(excludingMatch?.[1]);
  const vat = parseMoney(vatMatch?.[1]);
  const grand = parseMoney(grandMatch?.[1]);

  if (Number.isFinite(excluding) && Number.isFinite(vat)) {
    const expectedVat = Number((excluding * 0.05).toFixed(2));
    checks.push({
      id: "VAT-RECALCULATION",
      status: Math.abs(vat - expectedVat) < 0.01 ? "pass" : "fail",
      stated: vat,
      expected: expectedVat,
      message:
        Math.abs(vat - expectedVat) < 0.01
          ? "VAT equals 5% of the excluding-VAT total."
          : "The stated VAT does not equal 5% of the excluding-VAT total.",
    });
  }

  if (
    Number.isFinite(excluding) &&
    Number.isFinite(vat) &&
    Number.isFinite(grand)
  ) {
    const expectedGrand = Number((excluding + vat).toFixed(2));
    checks.push({
      id: "GRAND-TOTAL-RECALCULATION",
      status: Math.abs(grand - expectedGrand) < 0.01 ? "pass" : "fail",
      stated: grand,
      expected: expectedGrand,
      message:
        Math.abs(grand - expectedGrand) < 0.01
          ? "The grand total equals the excluding-VAT total plus VAT."
          : "The grand total does not reconcile with the excluding-VAT total and VAT.",
    });
  }

  const paymentSection =
    source.match(/payment\s+terms([\s\S]*?)(?:financial\s+and\s+commercial\s+terms|warranty|legal\s+and\s+contractual)/i)?.[1] ||
    "";

  const rowPattern = /(\d{1,3})\s*%[\s\S]{0,180}?([\d,]+\.\d{2})[\s\S]{0,100}?([\d,]+\.\d{2})/g;
  const milestones = [];
  let rowMatch;
  while ((rowMatch = rowPattern.exec(paymentSection)) !== null) {
    milestones.push({
      percentage: Number(rowMatch[1]),
      excludingVat: parseMoney(rowMatch[2]),
      includingVat: parseMoney(rowMatch[3]),
    });
  }

  if (milestones.length >= 4 && Number.isFinite(excluding)) {
    const operationalRows = milestones.filter((item) => item.percentage < 100);
    const percentageTotal = operationalRows.reduce(
      (sum, item) => sum + item.percentage,
      0
    );
    checks.push({
      id: "MILESTONE-PERCENTAGE-TOTAL",
      status: percentageTotal === 100 ? "pass" : "fail",
      stated: percentageTotal,
      expected: 100,
      message:
        percentageTotal === 100
          ? "Payment milestone percentages total 100%."
          : "Payment milestone percentages do not total 100%.",
    });

    operationalRows.forEach((item, index) => {
      const expected = Number(
        (excluding * (item.percentage / 100)).toFixed(2)
      );
      checks.push({
        id: `MILESTONE-${index + 1}-AMOUNT`,
        status:
          Math.abs(item.excludingVat - expected) < 0.01 ? "pass" : "fail",
        percentage: item.percentage,
        stated: item.excludingVat,
        expected,
        message:
          Math.abs(item.excludingVat - expected) < 0.01
            ? `The ${item.percentage}% milestone amount is correct.`
            : `The ${item.percentage}% milestone amount does not match the excluding-VAT contract value.`,
      });
    });
  }

  return {
    checks,
    passed: checks.filter((item) => item.status === "pass").length,
    failed: checks.filter((item) => item.status === "fail").length,
  };
};

const buildCategoryPackets = (referenceFiles, proposalText) =>
  CATEGORIES.map((category) => {
    const files = referenceFiles.filter((file) => file.category === category.key);
    const referenceText = files
      .map(
        (file) =>
          `REFERENCE FILE: ${file.name}\n${trimForPrompt(
            file.content,
            MAX_REFERENCE_CHARS_PER_CATEGORY
          )}`
      )
      .join("\n\n---\n\n");

    const proposalExtract = selectRelevantPassages(
      proposalText,
      category,
      referenceText
    );

    return {
      key: category.key,
      label: category.label,
      weight: category.weight,
      files,
      referenceText,
      proposalExtract:
        proposalExtract || trimForPrompt(proposalText, 6000),
    };
  });

const buildValidatorPrompt = (packets, diagnostics) => {
  const packetText = packets
    .map((packet) =>
      [
        `CATEGORY: ${packet.key}`,
        `LABEL: ${packet.label}`,
        `WEIGHT: ${packet.weight}`,
        `REFERENCE FILES: ${
          packet.files.map((file) => file.name).join(", ") || "None"
        }`,
        "REFERENCE EXTRACTS:",
        packet.referenceText || "No category-specific reference document was found.",
        "PROPOSAL EXTRACTS:",
        packet.proposalExtract,
      ].join("\n")
    )
    .join("\n\n==============================\n\n");

  return [
    "PROPOSAL DIAGNOSTICS:",
    JSON.stringify(diagnostics, null, 2),
    "",
    "CATEGORY EVIDENCE PACKETS:",
    packetText,
  ].join("\n");
};

const normalizeStringArray = (value, limit = 5) =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(
          (item) =>
            item &&
            !/^(none|n\/?a|not applicable|no issues|nothing identified)$/i.test(item)
        )
        .slice(0, limit)
    : [];

const categorySystemPrompt = (packet) => [
  "You are ATHINA Commercial Proposal Validator.",
  "Return ONLY one valid JSON object. Do not use markdown or code fences.",
  `Evaluate only the ${packet.key} category.`,
  "Use the supplied reference extracts as authoritative when available.",
  "If no category reference is available, assess intrinsic proposal completeness and clearly mark lower confidence; do not assign zero merely because no reference exists.",
  "Do not invent requirements, file names, clauses, figures, or evidence.",
  "Every issue must be traceable to a proposal excerpt or named reference file.",
  "Scores: 90-100 excellent; 80-89 strong; 65-79 acceptable with conditions; 45-64 major rework; 0-44 unacceptable or unsupported.",
  "Output keys: key, score, confidence, achieved, assessment, strengths, issues, recommendations, referencesUsed, proposalEvidence, referenceEvidence.",
  "The key must exactly match the requested category.",
  "Keep each list to maximum four concise items.",
].join("\n");

const validateCategoryPacket = async (packet) => {
  const userPrompt = [
    `CATEGORY: ${packet.key}`,
    `LABEL: ${packet.label}`,
    `REFERENCE FILES: ${packet.files.map((file) => file.name).join(", ") || "None"}`,
    "REFERENCE EXTRACTS:",
    packet.referenceText || "No category-specific reference is available.",
    "PROPOSAL EXTRACTS:",
    packet.proposalExtract,
  ].join("\n\n");

  const response = await callLLM({
    messages: [
      { role: "system", content: categorySystemPrompt(packet) },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.05,
    maxTokens: 1100,
    jsonMode: true,
  });

  const parsed =
    typeof response === "string" ? safeJsonParse(response) : response;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`ATHINA could not parse the ${packet.key} validation output.`);
  }

  return { ...parsed, key: packet.key };
};

const normalizeValidationResult = (
  result,
  referenceFiles,
  proposalText,
  diagnostics,
  commercialChecks
) => {
  const modelCategories = Array.isArray(result?.categories)
    ? result.categories
    : [];

  const categories = CATEGORIES.map((category) => {
    const match = modelCategories.find(
      (item) => String(item?.key || "").toLowerCase() === category.key
    );
    const categoryReferences = referenceFiles.filter(
      (file) => file.category === category.key
    );
    const evidence = calculateEvidenceScore(
      proposalText,
      categoryReferences,
      category.key
    );
    const modelScore = clamp(match?.score);
    const groundedScore = applyGrounding(
      modelScore,
      evidence,
      category.key
    );

    return {
      key: category.key,
      label: category.label,
      weight: category.weight,
      score: groundedScore,
      status:
        groundedScore >= 80
          ? "pass"
          : groundedScore >= 60
            ? "conditional"
            : "fail",
      achieved: String(match?.achieved || "").trim(),
      assessment:
        String(match?.assessment || "").trim() ||
        (groundedScore < 60
          ? "The proposal does not demonstrate sufficient evidence for this category."
          : "The proposal demonstrates reasonable alignment for this category."),
      strengths: normalizeStringArray(match?.strengths),
      issues: normalizeStringArray(match?.issues),
      recommendations: normalizeStringArray(match?.recommendations),
      referencesUsed: normalizeStringArray(
        match?.referencesUsed?.length
          ? match.referencesUsed
          : categoryReferences.map((file) => file.name)
      ),
      proposalEvidence: normalizeStringArray(match?.proposalEvidence, 4),
      referenceEvidence: normalizeStringArray(match?.referenceEvidence, 4),
      confidence: clamp(
        match?.confidence ||
          (evidence.hasReferences ? 75 : 55)
      ),
      referenceCoverage: evidence.hasReferences
        ? "available"
        : "not_available",
      evidence: {
        hasReferences: evidence.hasReferences,
        semanticOverlap: Number(evidence.semanticOverlap.toFixed(4)),
        proposalCoverage: Number(evidence.proposalCoverage.toFixed(4)),
        numericOverlap: Number(evidence.numericOverlap.toFixed(4)),
        evidenceScore: evidence.score,
      },
    };
  });

  const weightedScore = Math.round(
    categories.reduce(
      (sum, category) => sum + category.score * category.weight,
      0
    ) / CATEGORIES.reduce((sum, category) => sum + category.weight, 0)
  );

  const categoryMap = new Map(categories.map((item) => [item.key, item]));
  const hardGateFailures = [];

  if ((categoryMap.get("legal")?.score || 0) < 45) {
    hardGateFailures.push("Legal and contractual alignment is below the minimum threshold.");
  }
  if ((categoryMap.get("pricing")?.score || 0) < 45) {
    hardGateFailures.push("Pricing and commercial alignment is below the minimum threshold.");
  }
  if ((categoryMap.get("architecture")?.score || 0) < 40) {
    hardGateFailures.push("Technical architecture evidence is below the minimum threshold.");
  }
  if (!diagnostics.sections.pricing) {
    hardGateFailures.push("No clear pricing or commercial section was detected.");
  }
  if (!diagnostics.sections.scope) {
    hardGateFailures.push("No clear scope-of-work section was detected.");
  }

  const coreCategories = categories.filter((category) =>
    CORE_CATEGORY_KEYS.has(category.key)
  );
  const severeMismatchCount = coreCategories.filter(
    (category) => category.score <= 20
  ).length;
  const unrelated = severeMismatchCount >= 4;

  let decision = "rework";
  if (unrelated) decision = "rejected_unrelated";
  else if (weightedScore >= 82 && hardGateFailures.length === 0) {
    decision = "approved";
  } else if (weightedScore >= 65 && hardGateFailures.length <= 1) {
    decision = "conditional";
  }

  const deterministicFailures = (commercialChecks?.checks || [])
    .filter((item) => item.status === "fail")
    .map((item) => item.message);
  const modelMissingItems = normalizeStringArray(result?.missingItems, 10);
  const missingItems = Array.from(
    new Set([
      ...hardGateFailures,
      ...deterministicFailures,
      ...modelMissingItems,
    ])
  ).slice(0, 12);

  return {
    summary:
      unrelated
        ? "The proposal appears materially unrelated to the supplied reference requirements and should not proceed under this scope."
        : String(result?.summary || "Validation completed.").trim(),
    overallScore: clamp(weightedScore),
    decision,
    confidence: clamp(result?.confidence || 70),
    hardGateFailures,
    missingItems,
    proposalDiagnostics: diagnostics,
    deterministicCommercialChecks: commercialChecks,
    categories,
    disclaimer:
      "ATHINA provides a structured commercial-review aid. Final legal, financial, pricing, and technical approval remains with authorized reviewers.",
  };
};

const listAllReferenceObjects = async (
  client,
  folder = VALIDATOR_REFERENCE_PREFIX,
  page = 0,
  accumulated = []
) => {
  const { data, error } = await client.storage.from(VALIDATOR_BUCKET).list(folder, {
    limit: 100,
    offset: page * 100,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    throw new Error(`Failed to list reference documents: ${error.message}`);
  }

  const entries = data || [];
  for (const entry of entries) {
    if (!entry?.name) continue;
    if (entry.id === null) {
      const nestedFolder = [folder, entry.name]
        .filter(Boolean)
        .join("/")
        .replace(/^\/+/, "");
      await listAllReferenceObjects(client, nestedFolder, 0, accumulated);
      continue;
    }

    const fullPath = [folder, entry.name]
      .filter(Boolean)
      .join("/")
      .replace(/^\/+/, "");
    if (!isReferenceCandidate(fullPath)) continue;

    accumulated.push({
      name: entry.name,
      path: fullPath,
      updatedAt: entry.updated_at || null,
      size: entry.metadata?.size || null,
      category: detectCategory(entry.name),
    });
  }

  if (entries.length === 100) {
    return listAllReferenceObjects(client, folder, page + 1, accumulated);
  }
  return accumulated;
};

const getReferenceFiles = async () => {
  if (
    referenceCache.expiresAt > Date.now() &&
    referenceCache.files.length > 0
  ) {
    return referenceCache.files;
  }

  const client = ensureSupabase();
  const primaryPrefix = VALIDATOR_REFERENCE_PREFIX;
  const primaryFiles = await listAllReferenceObjects(client, primaryPrefix);
  const listedFiles =
    primaryFiles.length > 0
      ? primaryFiles
      : primaryPrefix
        ? await listAllReferenceObjects(client, "")
        : primaryFiles;

  const hydratedFiles = [];
  for (const file of listedFiles) {
    const { data, error } = await client.storage
      .from(VALIDATOR_BUCKET)
      .download(file.path);

    if (error) {
      throw new Error(
        `Failed to download reference document ${file.path}: ${error.message}`
      );
    }

    const buffer = await toBuffer(data);
    const content = await extractTextFromBuffer(
      buffer,
      file.name,
      data.type || "application/octet-stream"
    );

    hydratedFiles.push({
      ...file,
      category: detectCategory(file.name, content),
      content,
    });
  }

  referenceCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    files: hydratedFiles.map((file) => ({
      ...file,
      sourcePrefix: primaryPrefix,
    })),
  };

  return referenceCache.files;
};

const uploadProposalCopy = async ({
  buffer,
  fileName,
  mimeType,
  userId,
  sessionId,
}) => {
  const client = ensureSupabase();
  const safeName = String(fileName || "proposal").replace(
    /[^a-zA-Z0-9._-]+/g,
    "-"
  );
  const scope = userId || sessionId || "anonymous";
  const digest = crypto
    .createHash("sha1")
    .update(buffer)
    .digest("hex")
    .slice(0, 12);
  const storagePath = `${VALIDATOR_UPLOAD_PREFIX}/${scope}/${Date.now()}-${digest}-${safeName}`;

  const { error } = await client.storage
    .from(VALIDATOR_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to archive uploaded proposal: ${error.message}`);
  }
  return storagePath;
};

export const getProposalValidatorContext = async () => {
  const referenceFiles = await getReferenceFiles();
  return {
    success: true,
    bucket: VALIDATOR_BUCKET,
    referencePrefix: VALIDATOR_REFERENCE_PREFIX,
    referenceCount: referenceFiles.length,
    categoryCoverage: CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      files: referenceFiles.filter((file) => file.category === category.key)
        .length,
    })),
    referenceFiles: referenceFiles.map((file) => ({
      name: file.name,
      path: file.path,
      category: file.category,
      updatedAt: file.updatedAt,
      size: file.size,
      excerpt: trimForPrompt(file.content, 220),
    })),
  };
};

export const getProposalValidatorDebug = async () => {
  const client = ensureSupabase();
  const prefix = VALIDATOR_REFERENCE_PREFIX;

  const inspect = async (folder) => {
    const { data, error } = await client.storage.from(VALIDATOR_BUCKET).list(folder, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    return {
      folder: folder || "/",
      error: error ? error.message : null,
      count: Array.isArray(data) ? data.length : 0,
      sample: (data || []).slice(0, 12).map((item) => ({
        name: item.name,
        id: item.id,
      })),
    };
  };

  const [prefixList, rootList] = await Promise.all([
    inspect(prefix),
    inspect(""),
  ]);
  const referenceFiles = await getReferenceFiles();

  return {
    success: true,
    bucket: VALIDATOR_BUCKET,
    referencePrefix: prefix,
    supabaseUrlHost: (() => {
      try {
        return new URL(process.env.SUPABASE_URL || "").host || null;
      } catch {
        return null;
      }
    })(),
    hasServiceRoleKey: hasLikelyServiceRoleKey(),
    keyKind: detectKeyKind(),
    prefixList,
    rootList,
    detectedReferenceCount: referenceFiles.length,
    detectedReferenceSample: referenceFiles
      .slice(0, 12)
      .map((file) => file.path),
    categoryCoverage: CATEGORIES.map((category) => ({
      key: category.key,
      count: referenceFiles.filter((file) => file.category === category.key)
        .length,
    })),
  };
};

export const validateProposalUpload = async ({
  fileName,
  mimeType,
  contentBase64,
  userId = null,
  sessionId = "default",
}) => {
  if (!fileName || !contentBase64) {
    throw new Error("Missing proposal file data.");
  }

  const buffer = Buffer.from(String(contentBase64), "base64");
  if (!buffer.length) throw new Error("The uploaded proposal is empty.");

  const proposalText = await extractTextFromBuffer(
    buffer,
    fileName,
    mimeType
  );
  if (!proposalText || proposalText.length < 100) {
    throw new Error(
      "ATHINA could not extract enough readable text from the uploaded proposal."
    );
  }

  const referenceFiles = await getReferenceFiles();
  if (!referenceFiles.length) {
    throw new Error(
      `No reference files were found in Supabase bucket "${VALIDATOR_BUCKET}" under prefix "${
        VALIDATOR_REFERENCE_PREFIX || "/"
      }".`
    );
  }

  const proposalStoragePath = await uploadProposalCopy({
    buffer,
    fileName,
    mimeType,
    userId,
    sessionId,
  });

  const diagnostics = buildProposalDiagnostics(proposalText);
  const commercialChecks = extractCommercialChecks(proposalText);
  const packets = buildCategoryPackets(referenceFiles, proposalText);

  console.log("[VALIDATOR] Starting category validation", {
    proposalName: fileName,
    proposalCharacters: proposalText.length,
    references: referenceFiles.map((file) => ({
      name: file.name,
      category: file.category,
    })),
    packetSizes: packets.map((packet) => ({
      key: packet.key,
      referenceCharacters: packet.referenceText.length,
      proposalCharacters: packet.proposalExtract.length,
    })),
  });

  const categoryResults = [];
  const categoryErrors = [];

  // Sequential calls are more reliable with rate-limited/free model providers.
  for (const packet of packets) {
    try {
      const categoryResult = await validateCategoryPacket(packet);
      categoryResults.push(categoryResult);
      console.log("[VALIDATOR] Category completed", {
        key: packet.key,
        score: categoryResult.score,
        confidence: categoryResult.confidence,
      });
    } catch (error) {
      categoryErrors.push({
        key: packet.key,
        error: error?.message || String(error),
      });
      console.error("[VALIDATOR] Category failed", {
        key: packet.key,
        error: error?.message || error,
      });
    }
  }

  if (categoryResults.length !== CATEGORIES.length) {
    throw new Error(
      `Proposal validation was incomplete. Completed ${categoryResults.length}/${CATEGORIES.length} categories. ` +
        categoryErrors.map((item) => `${item.key}: ${item.error}`).join("; ")
    );
  }

  const parsed = {
    summary: "Category-by-category proposal validation completed.",
    confidence: Math.round(
      categoryResults.reduce(
        (sum, item) => sum + clamp(item.confidence || 0),
        0
      ) / categoryResults.length
    ),
    missingItems: [],
    categories: categoryResults,
  };

  const result = normalizeValidationResult(
    parsed,
    referenceFiles,
    proposalText,
    diagnostics,
    commercialChecks
  );

  const reportId = await saveValidationReport({
    sessionId,
    userId,
    fileName,
    proposalStoragePath,
    result,
  });

  return {
    success: true,
    reportId,
    proposalName: fileName,
    proposalStoragePath,
    referenceFiles: referenceFiles.map((file) => ({
      name: file.name,
      path: file.path,
      category: file.category,
    })),
    result,
  };
};
