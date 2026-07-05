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
  // Try direct parse
  try { return JSON.parse(text); } catch { /* continue */ }
  // Try extracting from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch { /* continue */ }
  }
  // Try extracting JSON object from surrounding text
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
  }
  return null;
};

export const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
