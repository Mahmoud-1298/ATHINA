const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 200;

export const chunkText = (
  text,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
) => {
  const cleaned = String(text || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return [];
  }

  const chunks = [];

  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(
      start + chunkSize,
      cleaned.length
    );

    if (end < cleaned.length) {
      const period = cleaned.lastIndexOf(
        ".",
        end
      );

      const newline = cleaned.lastIndexOf(
        "\n",
        end
      );

      const breakpoint = Math.max(
        period,
        newline
      );

      if (
        breakpoint > start + chunkSize * 0.6
      ) {
        end = breakpoint + 1;
      }
    }

    const chunk = cleaned
      .slice(start, end)
      .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    start = Math.max(
      end - overlap,
      start + 1
    );
  }

  return chunks;
};