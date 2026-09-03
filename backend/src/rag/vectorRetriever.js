import { getSupabaseClient } from "../memory/supabaseMemory.js";

const VECTOR_DIMENSIONS = 1536;
const TABLE_NAME = "validator_reference_chunks";

const toVectorLiteral = (embedding) => {
	if (!Array.isArray(embedding) || embedding.length !== VECTOR_DIMENSIONS) {
		throw new Error(
			`[RAG] Query embedding must contain ${VECTOR_DIMENSIONS} dimensions.`
		);
	}

	return `[${embedding.join(",")}]`;
};

export const retrieveReferenceChunks = async ({
	embedding,
	category = null,
	limit = 8,
	minSimilarity = 0,
}) => {
	const client = getSupabaseClient();
	if (!client) throw new Error("[RAG] Supabase is not configured.");

	const { data, error } = await client.rpc("match_validator_reference_chunks", {
		query_embedding_input: toVectorLiteral(embedding),
		filter_category: category,
		match_count: limit,
	});

	if (error) {
		throw new Error(
			`[RAG] Failed to retrieve reference chunks from ${TABLE_NAME}: ${error.message}`
		);
	}

	return (data || [])
		.filter((row) => Number(row.similarity || 0) >= minSimilarity)
		.map((row) => ({
			id: row.id,
			name: row.file_name,
			path: row.file_path,
			category: row.category,
			chunkIndex: row.chunk_index,
			chunkHash: row.chunk_hash,
			content: row.chunk_text,
			similarity: Number(row.similarity || 0),
			source: "vector",
		}));
};

export { VECTOR_DIMENSIONS };
