export const fetchWithTimeout = async (url, options = {}, timeoutMs = 9000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const cleanText = (value = "") =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

export const decodeDuckDuckGoUrl = (rawUrl = "") => {
  try {
    if (rawUrl.startsWith("/l/?")) {
      const parsed = new URL("https://duckduckgo.com" + rawUrl);
      const uddg = parsed.searchParams.get("uddg");
      return uddg ? decodeURIComponent(uddg) : rawUrl;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
};

export const extractDuckDuckGoHtmlResults = (html, limit = 5) => {
  const blockRegex = /<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/g;
  const out = [];
  let match;
  while ((match = blockRegex.exec(html)) !== null && out.length < limit) {
    const block = match[1];
    const linkMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const url = decodeDuckDuckGoUrl(linkMatch[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      title: cleanText(linkMatch[2]).slice(0, 180),
      url,
      snippet: cleanText(snippetMatch?.[1] || "").slice(0, 340),
    });
  }
  return out;
};

export const isLikelyIframeBlocked = (responseHeaders) => {
  const xFrame = responseHeaders.get("x-frame-options") || "";
  const csp = responseHeaders.get("content-security-policy") || "";
  return /deny|sameorigin/i.test(xFrame) || /frame-ancestors\s+'none'|frame-ancestors\s+'self'/i.test(csp);
};

export const normalizeUrl = (urlOrQuery) => {
  if (/^https?:\/\//i.test(urlOrQuery)) return urlOrQuery;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(urlOrQuery)) return "https://" + urlOrQuery;
  return null;
};

export const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const safeJsonParse = (text) => {
  if (!text || typeof text !== "string") return null;

  const tryParse = (candidate) => {
    if (!candidate || typeof candidate !== "string") return null;
    const cleaned = candidate
      .replace(/^\uFEFF/, "")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/^[\s`]*json\s*/i, "")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();

    if (!cleaned) return null;
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  };

  const findBalancedJsonChunk = (source) => {
    const startIdx = source.search(/[\[{]/);
    if (startIdx === -1) return null;

    let inString = false;
    let escaped = false;
    const stack = [];

    for (let i = startIdx; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{" || ch === "[") {
        stack.push(ch);
        continue;
      }

      if (ch === "}" || ch === "]") {
        const expected = ch === "}" ? "{" : "[";
        if (stack[stack.length - 1] === expected) stack.pop();
        if (stack.length === 0) return source.slice(startIdx, i + 1);
      }
    }

    // Handle truncated model output by balancing close tokens.
    if (stack.length > 0) {
      let chunk = source.slice(startIdx).trim();
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        chunk += stack[i] === "{" ? "}" : "]";
      }
      return chunk;
    }

    return null;
  };

  const direct = tryParse(text);
  if (direct !== null) return direct;

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const fenced = tryParse(fenceMatch[1]);
    if (fenced !== null) return fenced;
  }

  const balanced = findBalancedJsonChunk(text);
  if (balanced) {
    const fromBalanced = tryParse(balanced);
    if (fromBalanced !== null) return fromBalanced;
  }

  return null;
};

export const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
