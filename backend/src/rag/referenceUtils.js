import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { getSupabaseClient } from "../memory/supabaseMemory.js";
import { cleanText } from "../utils/helpers.js";

const VALIDATOR_BUCKET =
  process.env.SUPABASE_VALIDATOR_BUCKET ||
  "athina-validator";

const VALIDATOR_REFERENCE_PREFIX = (
  process.env.SUPABASE_VALIDATOR_REFERENCE_PREFIX ||
  "reference"
).replace(/^\/+|\/+$/g, "");

const normalizeName = (value) =>
  String(value || "")
    .toLowerCase()
    .trim();

export const detectCategory = (
  fileName,
  content = ""
) => {
  const name = normalizeName(fileName);

  if (
    /costing|cost[_ -]?sheet|pricing|price|quotation|quote|commercial/
      .test(name)
  ) {
    return "pricing";
  }

  if (
    /financial|finance|payment|invoice|billing/
      .test(name)
  ) {
    return "finance";
  }

  if (
    /legal|contract|terms|compliance/
      .test(name)
  ) {
    return "legal";
  }

  if (
    /architecture|solution[_ -]?requirements?|technical|design/
      .test(name)
  ) {
    return "architecture";
  }

  if (
    /grammar|writing|language|style/
      .test(name)
  ) {
    return "grammar";
  }

  return "context";
};

export const isReferenceCandidate = (
  path
) => {
  const normalized =
    normalizeName(path);

  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("/.")
  ) {
    return false;
  }

  return /\.(pdf|docx|txt|md|json)$/i.test(
    normalized
  );
};

export const toBuffer = async (
  blob
) => {
  const arrayBuffer =
    await blob.arrayBuffer();

  return Buffer.from(arrayBuffer);
};

export const extractTextFromBuffer =
  async (
    buffer,
    fileName,
    mimeType =
      "application/octet-stream"
  ) => {
    const lowerName =
      normalizeName(fileName);

    if (!buffer?.length) {
      return "";
    }

    if (
      mimeType.includes("pdf") ||
      lowerName.endsWith(".pdf")
    ) {
      const parsed =
        await pdfParse(buffer);

      return cleanText(
        parsed.text || ""
      );
    }

    if (
      mimeType.includes("word") ||
      lowerName.endsWith(".docx")
    ) {
      const parsed =
        await mammoth.extractRawText({
          buffer,
        });

      return cleanText(
        parsed.value || ""
      );
    }

    return cleanText(
      buffer.toString("utf8")
    );
  };

export const listAllReferenceObjects =
  async (
    client,
    folder =
      VALIDATOR_REFERENCE_PREFIX,
    page = 0,
    accumulated = []
  ) => {
    const { data, error } =
      await client.storage
        .from(
          VALIDATOR_BUCKET
        )
        .list(folder, {
          limit: 100,
          offset: page * 100,
          sortBy: {
            column: "name",
            order: "asc",
          },
        });

    if (error) {
      throw new Error(
        `Failed to list references: ${error.message}`
      );
    }

    const entries = data || [];

    for (const entry of entries) {
      if (!entry?.name)
        continue;

      if (entry.id === null) {
        const nestedFolder = [
          folder,
          entry.name,
        ]
          .filter(Boolean)
          .join("/");

        await listAllReferenceObjects(
          client,
          nestedFolder,
          0,
          accumulated
        );

        continue;
      }

      const fullPath = [
        folder,
        entry.name,
      ]
        .filter(Boolean)
        .join("/");

      if (
        !isReferenceCandidate(
          fullPath
        )
      ) {
        continue;
      }

      accumulated.push({
        name: entry.name,
        path: fullPath,
        updatedAt:
          entry.updated_at ||
          null,
        size:
          entry.metadata
            ?.size || null,
      });
    }

    if (
      entries.length === 100
    ) {
      return listAllReferenceObjects(
        client,
        folder,
        page + 1,
        accumulated
      );
    }

    return accumulated;
  };

export const getReferenceFiles =
  async () => {
    const client =
      getSupabaseClient();

    if (!client) {
      throw new Error(
        "Supabase not configured."
      );
    }

    const files =
      await listAllReferenceObjects(
        client
      );

    const hydrated = [];

    for (const file of files) {
      const {
        data,
        error,
      } = await client.storage
        .from(
          VALIDATOR_BUCKET
        )
        .download(file.path);

      if (error) {
        throw new Error(
          error.message
        );
      }

      const buffer =
        await toBuffer(data);

      const content =
        await extractTextFromBuffer(
          buffer,
          file.name,
          data.type ||
            "application/octet-stream"
        );

      hydrated.push({
        ...file,
        category:
          detectCategory(
            file.name,
            content
          ),
        content,
      });
    }

    return hydrated;
  };