import crypto from "crypto";
import { loadEnv } from "../config/loadEnv.js";

loadEnv();

const { getEmbedding } = await import("../utils/embeddingClient.js");
const { getSupabaseClient } = await import("../memory/supabaseMemory.js");
const { chunkText } = await import("./chunker.js");
const { getReferenceFiles } = await import("./referenceUtils.js");

const TABLE_NAME =
  "validator_reference_chunks";
const VECTOR_DIMENSIONS = 1536;

const hashChunk = (text) =>
  crypto
    .createHash("sha1")
    .update(text)
    .digest("hex");

const toVectorLiteral = (
  embedding
) =>
  `[${embedding.join(",")}]`;

export const runReferenceIndexing =
  async () => {
    const client =
      getSupabaseClient();

    if (!client) {
      throw new Error(
        "Supabase not configured."
      );
    }

    const referenceFiles =
      await getReferenceFiles();

    console.log(
      `[INDEXER] Found files: ${referenceFiles.length}`
    );

    let inserted = 0;
    let skipped = 0;

    for (const file of referenceFiles) {
      console.log(
        `[INDEXER] Processing ${file.name}`
      );

      const chunks =
        chunkText(file.content);

      console.log(
        `[INDEXER] Created chunks: ${file.name} -> ${chunks.length}`
      );

      for (
        let chunkIndex = 0;
        chunkIndex < chunks.length;
        chunkIndex += 1
      ) {
        const chunk =
          chunks[chunkIndex];

        const chunkHash =
          hashChunk(chunk);

        const {
          data: existing,
        } = await client
          .from(TABLE_NAME)
          .select("id")
          .eq(
            "chunk_hash",
            chunkHash
          )
          .maybeSingle();

        if (existing) {
          skipped += 1;
          continue;
        }

        const embedding =
          await getEmbedding(
            chunk
          );

        if (!embedding) {
          throw new Error(
            `[INDEXER] Failed to create embedding for ${file.name} chunk ${chunkIndex}: embedding client returned null.`
          );
        }

        console.log(
          `[INDEXER] Generated embedding length: ${embedding.length}`
        );

        if (embedding.length !== VECTOR_DIMENSIONS) {
          throw new Error(
            `[INDEXER] Embedding dimension mismatch for ${file.name} chunk ${chunkIndex}: received ${embedding.length}, expected ${VECTOR_DIMENSIONS} for ${TABLE_NAME}.`
          );
        }

        const { error } =
          await client
            .from(TABLE_NAME)
            .insert([
              {
                file_name:
                  file.name,

                file_path:
                  file.path,

                category:
                  file.category,

                chunk_index:
                  chunkIndex,

                chunk_text:
                  chunk,

                chunk_hash:
                  chunkHash,

                embedding:
                  toVectorLiteral(
                    embedding
                  ),
              },
            ]);

        if (error) {
          console.error(
            `[INDEXER] Insert failed reason: ${error.message}`
          );
          throw new Error(
            `[INDEXER] Insert failed for ${file.name} chunk ${chunkIndex}: ${error.message}`
          );
        }

        console.log(
          `[INDEXER] Insert success: ${file.name} chunk ${chunkIndex}`
        );
        inserted += 1;
      }
    }

    console.log(
      `[INDEXER] Complete. Inserted ${inserted}, skipped ${skipped}.`
    );
  };

if (
  import.meta.url ===
  `file://${process.argv[1]}`
) {
  runReferenceIndexing()
    .then(() =>
      process.exit(0)
    )
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}