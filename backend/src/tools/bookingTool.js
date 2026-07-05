import { execute as webSearch } from "./webSearchTool.js";
import { callLLM } from "../utils/llmClient.js";

// Searches for hotels/services using web search, then uses LLM to extract structured results
// Future: integrate with Booking.com API, Expedia API, etc.

export const execute = async (params) => {
  const { query, checkIn, checkOut, minRating, location } = params;
  if (!query) return { success: false, error: "Missing query parameter" };

  // Build search query
  let searchQuery = query;
  if (minRating) searchQuery += " " + minRating + " star";
  if (location) searchQuery += " near " + location;
  searchQuery += " cheapest";

  // Search the web for options
  const searchResult = await webSearch({ query: searchQuery });
  if (!searchResult.success) {
    return { type: "booking", success: false, error: "Web search failed: " + searchResult.error };
  }

  // Use LLM to extract and rank hotel options from search results
  const llmResponse = await callLLM({
    messages: [
      {
        role: "system",
        content: "You are ATHINA's booking analyzer. Extract hotel/booking options from web search results. Return JSON with a 'options' array, each having name, price (if found), rating (if found), url, and notes. Pick the best cheapest option that meets the minimum rating requirement.",
      },
      {
        role: "user",
        content: "Search results:\n" + searchResult.summary + "\n\nMinimum rating: " + (minRating || "any") + " stars. Find the cheapest option that meets this requirement.",
      },
    ],
    temperature: 0.2,
    maxTokens: 800,
    jsonMode: true,
  });

  const options = llmResponse.options || [];
  const selected = options.find((o) => o.rating && Number(o.rating) >= (minRating || 0)) || options[0] || null;

  return {
    type: "booking",
    success: true,
    query,
    searchQuery,
    options,
    selected,
    note: selected
      ? "Found: " + selected.name + (selected.price ? " at " + selected.price : "") + (selected.rating ? " (" + selected.rating + " stars)" : "")
      : "No booking option found matching criteria. Real booking API integration needed.",
  };
};

export const schema = {
  name: "booking",
  description: "Search for and analyze hotel/service booking options from web results",
  params: {
    query: "string (required) - what to book (e.g. 'hotel')",
    location: "string (optional) - location for the booking",
    checkIn: "string (optional) - check-in date",
    checkOut: "string (optional) - check-out date",
    minRating: "number (optional) - minimum star rating required",
  },
};
