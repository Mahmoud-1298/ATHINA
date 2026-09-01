import { fetchWithTimeout, cleanText, extractDuckDuckGoHtmlResults } from "../utils/helpers.js";

const fetchHtmlResults = async (query) => {
  const htmlUrl = new URL("https://html.duckduckgo.com/html/");
  htmlUrl.searchParams.set("q", query);
  const htmlResponse = await fetchWithTimeout(
    htmlUrl.toString(),
    { headers: { "User-Agent": "ATHINA-Agent/1.0", Accept: "text/html" } },
    8000
  );
  if (!htmlResponse.ok) {
    throw new Error("Web search failed with status " + htmlResponse.status);
  }
  return extractDuckDuckGoHtmlResults(await htmlResponse.text());
};

const fetchApiResults = async (query) => {
  const apiUrl = new URL("https://api.duckduckgo.com/");
  apiUrl.searchParams.set("q", query);
  apiUrl.searchParams.set("format", "json");
  apiUrl.searchParams.set("no_html", "1");
  apiUrl.searchParams.set("skip_disambig", "1");
  const apiResponse = await fetchWithTimeout(
    apiUrl.toString(),
    { headers: { Accept: "application/json" } },
    6000
  );
  if (!apiResponse.ok) throw new Error("Web search fallback failed with status " + apiResponse.status);
  const data = await apiResponse.json();
  const topic = data.RelatedTopics?.find((item) => item.FirstURL);
  const fallbackUrl = data.AbstractURL || topic?.FirstURL || "https://duckduckgo.com/?q=" + encodeURIComponent(query);
  const snippet = cleanText(data.AbstractText || topic?.Text || "");
  if (!snippet) throw new Error("DuckDuckGo instant answer returned no usable content");
  return [{ title: data.Heading || query, url: fallbackUrl, snippet }];
};

// Reliable last resort: Wikipedia's public search API rarely rate-limits or
// blocks datacenter/cloud egress the way DuckDuckGo's endpoints sometimes do.
const fetchWikipediaResults = async (query) => {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("srlimit", "5");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const response = await fetchWithTimeout(
    searchUrl.toString(),
    { headers: { Accept: "application/json" } },
    6000
  );
  if (!response.ok) throw new Error("Wikipedia search failed with status " + response.status);

  const data = await response.json();
  const hits = data?.query?.search || [];
  if (hits.length === 0) throw new Error("Wikipedia search returned no results");

  return hits.map((hit) => ({
    title: cleanText(hit.title || query),
    url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(hit.title || "").replace(/ /g, "_")),
    snippet: cleanText(hit.snippet || ""),
  }));
};

// DuckDuckGo endpoints occasionally block or rate-limit cloud/datacenter
// egress (common on Render/AWS/etc.), so no single provider failure may ever
// doom the whole tool. Try the lightest/fastest option first.
const searchWebResults = async (query) => {
  const providers = [fetchApiResults, fetchHtmlResults, fetchWikipediaResults];
  const failures = [];

  for (const provider of providers) {
    try {
      const results = await provider(query);
      if (results.length > 0) return results;
    } catch (error) {
      failures.push(error?.message || String(error));
      console.warn(
        `[WEB_SEARCH] Provider "${provider.name}" failed, trying next:`,
        error?.message || error
      );
    }
  }

  throw new Error("All web search providers failed: " + failures.join(" | "));
};

export const execute = async (params) => {
  const { query } = params;
  if (!query) return { success: false, error: "Missing query parameter" };

  try {
    const results = await searchWebResults(query);
    return {
      type: "web_search",
      success: true,
      query,
      results,
      summary: results.map((r, i) => (i + 1) + ". " + r.title + " - " + r.snippet).join("\n"),
    };
  } catch (error) {
    return {
      type: "web_search",
      success: false,
      query,
      error: error?.message || "Web search failed after all fallback attempts.",
    };
  }
};

export const schema = {
  name: "web_search",
  description: "Search the web for information using DuckDuckGo",
  params: { query: "string (required) - search query" },
};
