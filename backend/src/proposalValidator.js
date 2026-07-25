import crypto from "crypto";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { callLLM } from "./utils/llmClient.js";
import { cleanText, safeJsonParse } from "./utils/helpers.js";
import { getSupabaseClient, saveValidationReport } from "./memory/supabaseMemory.js";

const VALIDATOR_BUCKET = process.env.SUPABASE_VALIDATOR_BUCKET || "athina-validator";
const VALIDATOR_REFERENCE_PREFIX = (process.env.SUPABASE_VALIDATOR_REFERENCE_PREFIX || "reference").replace(/^\/+|\/+$/g, "");
const VALIDATOR_UPLOAD_PREFIX = (process.env.SUPABASE_VALIDATOR_UPLOAD_PREFIX || "uploads").replace(/^\/+|\/+$/g, "");
const DEFAULT_CATEGORIES = [
  { key: "legal", label: "Legal" },
  { key: "finance", label: "Finance" },
  { key: "pricing", label: "Pricing" },
  { key: "grammar", label: "Grammar" },
  { key: "context", label: "Context" },
  { key: "architecture", label: "Architecture" },
];
const CACHE_TTL_MS = 5 * 60 * 1000;

let referenceCache = {
  expiresAt: 0,
  files: [],
};

const normalizeName = (value) => String(value || "").toLowerCase();

const detectCategory = (fileName) => {
  const name = normalizeName(fileName);
  if (/legal|contract|term|compliance/.test(name)) return "legal";
  if (/financ|payment|cost|budget/.test(name)) return "finance";
  if (/price|pricing|quote|quotation|rate/.test(name)) return "pricing";
  if (/architect|solution|design|technical/.test(name)) return "architecture";
  if (/context|scope|brief|overview/.test(name)) return "context";
  if (/grammar|writing|style/.test(name)) return "grammar";
  return "context";
};

const isReferenceCandidate = (path) => {
  const normalized = normalizeName(path);
  if (!normalized) return false;
  if (normalized.startsWith(`${normalizeName(VALIDATOR_UPLOAD_PREFIX)}/`)) return false;
  if (normalized.includes("/.")) return false;
  return /\.(pdf|docx|txt|md|json)$/i.test(normalized);
};

const ensureSupabase = () => {
  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error("Supabase is not configured for proposal validation.");
  }
  return sb;
};

const toBuffer = async (blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const extractTextFromBuffer = async (buffer, fileName, mimeType = "application/octet-stream") => {
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

const trimForPrompt = (text, maxChars) => String(text || "").slice(0, maxChars);

const buildReferencePrompt = (referenceFiles) => {
  if (!referenceFiles.length) {
    return "No reference documents were found in Supabase storage.";
  }

  return referenceFiles
    .map((file) => [
      `Category: ${file.category}`,
      `File: ${file.name}`,
      `Path: ${file.path}`,
      "Reference content:",
      trimForPrompt(file.content, 4000),
    ].join("\n"))
    .join("\n\n---\n\n");
};

const normalizeValidationResult = (result, referenceFiles) => {
  const categories = Array.isArray(result?.categories) ? result.categories : [];
  const normalizedCategories = DEFAULT_CATEGORIES.map((category) => {
    const match = categories.find((item) => String(item?.key || "").toLowerCase() === category.key);
    return {
      key: category.key,
      label: category.label,
      score: Math.max(0, Math.min(100, Number(match?.score || 0))),
      achieved: match?.achieved || "",
      assessment: match?.assessment || "",
      strengths: Array.isArray(match?.strengths) ? match.strengths.slice(0, 5) : [],
      issues: Array.isArray(match?.issues) ? match.issues.slice(0, 5) : [],
      recommendations: Array.isArray(match?.recommendations) ? match.recommendations.slice(0, 5) : [],
      referencesUsed: Array.isArray(match?.referencesUsed) ? match.referencesUsed.slice(0, 5) : referenceFiles.filter((file) => file.category === category.key).map((file) => file.name).slice(0, 5),
    };
  });

  const average = normalizedCategories.length
    ? Math.round(normalizedCategories.reduce((sum, category) => sum + category.score, 0) / normalizedCategories.length)
    : 0;

  return {
    summary: result?.summary || "Validation completed.",
    overallScore: Math.max(0, Math.min(100, Number(result?.overallScore || average))),
    decision: result?.decision || (average >= 80 ? "approved" : average >= 60 ? "conditional" : "rework"),
    missingItems: Array.isArray(result?.missingItems) ? result.missingItems.slice(0, 8) : [],
    categories: normalizedCategories,
  };
};

const listAllReferenceObjects = async (sb, folder = VALIDATOR_REFERENCE_PREFIX, page = 0, acc = []) => {
  const { data, error } = await sb.storage.from(VALIDATOR_BUCKET).list(folder, {
    limit: 100,
    offset: page * 100,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    throw new Error("Failed to list reference documents: " + error.message);
  }

  const entries = data || [];
  for (const entry of entries) {
    if (!entry?.name) continue;
    if (entry.id === null) {
      const nestedFolder = [folder, entry.name].filter(Boolean).join("/").replace(/^\/+/, "");
      await listAllReferenceObjects(sb, nestedFolder, 0, acc);
      continue;
    }
    const fullPath = [folder, entry.name].filter(Boolean).join("/").replace(/^\/+/, "");
    if (!isReferenceCandidate(fullPath)) continue;
    acc.push({
      name: entry.name,
      path: fullPath,
      updatedAt: entry.updated_at || null,
      size: entry.metadata?.size || null,
      category: detectCategory(entry.name),
    });
  }

  if (entries.length === 100) {
    return listAllReferenceObjects(sb, folder, page + 1, acc);
  }

  return acc;
};

const getReferenceFiles = async () => {
  if (referenceCache.expiresAt > Date.now() && referenceCache.files.length > 0) {
    return referenceCache.files;
  }

  const sb = ensureSupabase();
  const primaryPrefix = VALIDATOR_REFERENCE_PREFIX;
  const listedPrimary = await listAllReferenceObjects(sb, primaryPrefix);
  const listedFiles = listedPrimary.length > 0
    ? listedPrimary
    : (primaryPrefix ? await listAllReferenceObjects(sb, "") : listedPrimary);
  const hydratedFiles = [];

  for (const file of listedFiles) {
    const { data, error } = await sb.storage.from(VALIDATOR_BUCKET).download(file.path);
    if (error) {
      throw new Error(`Failed to download reference document ${file.path}: ${error.message}`);
    }
    const buffer = await toBuffer(data);
    const content = await extractTextFromBuffer(buffer, file.name, data.type || "application/octet-stream");
    hydratedFiles.push({ ...file, content });
  }

  referenceCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    files: hydratedFiles.map((file) => ({ ...file, sourcePrefix: primaryPrefix })),
  };

  return hydratedFiles;
};

const uploadProposalCopy = async ({ buffer, fileName, mimeType, userId, sessionId }) => {
  const sb = ensureSupabase();
  const safeName = String(fileName || "proposal").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const scope = userId || sessionId || "anonymous";
  const digest = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 12);
  const storagePath = `${VALIDATOR_UPLOAD_PREFIX}/${scope}/${Date.now()}-${digest}-${safeName}`;
  const { error } = await sb.storage.from(VALIDATOR_BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error("Failed to archive uploaded proposal: " + error.message);
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

export const validateProposalUpload = async ({ fileName, mimeType, contentBase64, userId = null, sessionId = "default" }) => {
  if (!fileName || !contentBase64) {
    throw new Error("Missing proposal file data.");
  }

  const buffer = Buffer.from(String(contentBase64), "base64");
  const proposalText = await extractTextFromBuffer(buffer, fileName, mimeType);
  if (!proposalText) {
    throw new Error("ATHINA could not extract readable text from the uploaded proposal.");
  }

  const referenceFiles = await getReferenceFiles();
  if (!referenceFiles.length) {
    throw new Error(
      `No reference files were found in Supabase storage bucket "${VALIDATOR_BUCKET}" under prefix "${VALIDATOR_REFERENCE_PREFIX || "/"}". ` +
      "Upload your legal, finance, pricing, or architecture files there, or set SUPABASE_VALIDATOR_REFERENCE_PREFIX to the folder you actually use."
    );
  }

  const proposalStoragePath = await uploadProposalCopy({ buffer, fileName, mimeType, userId, sessionId });
  const referencePrompt = buildReferencePrompt(referenceFiles);
  const messages = [
    {
      role: "system",
      content: [
        "You are ATHINA Proposal Validator.",
        "Return ONLY valid JSON.",
        "Review the uploaded commercial proposal against the provided reference documents.",
        "Score each category from 0 to 100.",
        "Be strict, evidence-based, and specific.",
        "Categories: legal, finance, pricing, grammar, context, architecture.",
        "Output JSON with keys: summary, overallScore, decision, missingItems, categories.",
        "Each category object must contain: key, score, achieved, assessment, strengths, issues, recommendations, referencesUsed.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Reference documents:",
        referencePrompt,
        "",
        "Uploaded proposal:",
        trimForPrompt(proposalText, 18000),
      ].join("\n"),
    },
  ];

  const llmResult = await callLLM({ messages, temperature: 0.1, maxTokens: 1800, jsonMode: true });
  const parsed = typeof llmResult === "string" ? safeJsonParse(llmResult) : llmResult;
  if (!parsed) {
    throw new Error("ATHINA could not parse the validator output.");
  }

  const result = normalizeValidationResult(parsed, referenceFiles);
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