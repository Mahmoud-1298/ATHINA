import { fetchWithTimeout } from "../utils/helpers.js";

export const execute = async (params) => {
  const { query } = params;
  if (!query) return { success: false, error: "Missing query parameter" };

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const response = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": "ATHINA-Agent/1.0", Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Location lookup failed with status " + response.status);
  }

  const results = await response.json();
  const first = results?.[0];

  if (!first) {
    return { type: "locate", query, success: false, error: "Location not found." };
  }

  return {
    type: "locate",
    query,
    success: true,
    name: first.display_name,
    lat: Number(first.lat),
    lng: Number(first.lon),
    mapUrl: "https://www.openstreetmap.org/?mlat=" + first.lat + "&mlon=" + first.lon + "#map=14/" + first.lat + "/" + first.lon,
  };
};

export const schema = {
  name: "maps",
  description: "Find a location and get coordinates using OpenStreetMap Nominatim",
  params: { query: "string (required) - location to find" },
};
