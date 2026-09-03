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

	const rpcArgs = {
		p_query_embedding: toVectorLiteral(embedding),
		p_filter_category: category,
		p_match_count: limit,
	};
	let { data, error } = await client.rpc(
		"match_validator_reference_chunks_v2",
		rpcArgs
	);

	if (error) {
		const migrationHint = /function .*match_validator_reference_chunks|schema cache/i.test(
			error.message
		)
			? " Apply supabase/migrations/005_validator_reference_chunks.sql, then run NOTIFY pgrst, 'reload schema' in the production project."
			: "";
		throw new Error(
			`[RAG] Failed to retrieve reference chunks from ${TABLE_NAME}: ${error.message}${migrationHint}`
		);
	}

	if (!data?.length && category) {
		const fallback = await client.rpc("match_validator_reference_chunks_v2", {
			...rpcArgs,
			p_filter_category: null,
			p_match_count: Math.max(limit * 8, 64),
		});

		if (fallback.error) {
			throw new Error(
				`[RAG] Category retrieval returned no rows, and unfiltered retrieval failed: ${fallback.error.message}`
			);
		}

		data = (fallback.data || []).filter(
			(row) => String(row.category || "").toLowerCase() === String(category).toLowerCase()
		);
	}

	const chunks = (data || [])
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

	console.log(
		`[RAG] Retrieved ${chunks.length} chunks${category ? ` for category ${category}` : ""}`
	);
	return chunks;
};

export { VECTOR_DIMENSIONS };
