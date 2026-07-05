import { fetchWithTimeout, cleanText, extractDuckDuckGoHtmlResults } from "../utils/helpers.js";

const searchWebResults = async (query) => {
  const htmlUrl = new URL("https://html.duckduckgo.com/html/");
  htmlUrl.searchParams.set("q", query);
  const htmlResponse = await fetchWithTimeout(htmlUrl.toString(), {
    headers: { "User-Agent": "ATHINA-Agent/1.0", Accept: "text/html" },
  });
  if (!htmlResponse.ok) {
    throw new Error("Web search failed with status " + htmlResponse.status);
  }
  const html = await htmlResponse.text();
  const htmlResults = extractDuckDuckGoHtmlResults(html);
  if (htmlResults.length > 0) return htmlResults;

  // Fallback to DuckDuckGo API
  const apiUrl = new URL("https://api.duckduckgo.com/");
  apiUrl.searchParams.set("q", query);
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("no_html", "1");
  apiUrl.searchParams.set("skip_disambig", "1");
  const apiResponse = await fetchWithTimeout(apiUrl.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!apiResponse.ok) throw new Error("Web search fallback failed with status " + apiResponse.status);
  const data = await apiResponse.json();
  const topic = data.RelatedTopics?.find((item) => item.FirstURL);
  const fallbackUrl = data.AbstractURL || topic?.FirstURL || "https://duckduckgo.com/?q=" + encodeURIComponent(query);
  return [{ title: data.Heading || query, url: fallbackUrl, snippet: cleanText(data.AbstractText || topic?.Text || "") }];
};

export const execute = async (params) => {
  const { query } = params;
  if (!query) return { success: false, error: "Missing query parameter" };
  const results = await searchWebResults(query);
  return {
    type: "web_search",
    success: true,
    query,
    results,
    summary: results.map((r, i) => (i + 1) + ". " + r.title + " - " + r.snippet).join("\n"),
  };
};

export const schema = {
  name: "web_search",
  description: "Search the web for information using DuckDuckGo",
  params: { query: "string (required) - search query" },
};
