import { fetchWithTimeout } from "../utils/helpers.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const TOMTOM_TRAFFIC_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json";

const buildMapUrl = ({ fromLat, fromLng, toLat, toLng }) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${fromLat}%2C${fromLng}%3B${toLat}%2C${toLng}`;

const geocode = async (query) => {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      "User-Agent": "ATHINA-Agent/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed for \"${query}\" with status ${response.status}`);
  }

  const results = await response.json();
  const first = results?.[0];

  if (!first) {
    return null;
  }

  return {
    query,
    name: first.display_name,
    lat: Number(first.lat),
    lng: Number(first.lon),
  };
};

const fetchRoute = async ({ from, to }) => {
  const coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = new URL(`${OSRM_BASE_URL}/${coordinates}`);
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", "false");

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      "User-Agent": "ATHINA-Agent/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Routing failed with status ${response.status}`);
  }

  const data = await response.json();
  const route = data?.routes?.[0];

  if (!route) {
    throw new Error("No drivable route found between the two points.");
  }

  return {
    distanceMeters: Number(route.distance || 0),
    durationSeconds: Number(route.duration || 0),
  };
};

const fetchTomTomTraffic = async ({ lat, lng }) => {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return {
      available: false,
      reason: "TOMTOM_API_KEY is not configured.",
    };
  }

  const url = new URL(TOMTOM_TRAFFIC_URL);
  url.searchParams.set("point", `${lat},${lng}`);
  url.searchParams.set("unit", "KMPH");
  url.searchParams.set("key", apiKey);

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    return {
      available: false,
      reason: `TomTom traffic lookup failed with status ${response.status}.`,
    };
  }

  const data = await response.json();
  const segment = data?.flowSegmentData;

  if (!segment) {
    return {
      available: false,
      reason: "TomTom response did not include flow segment data.",
    };
  }

  const freeFlowSpeed = Number(segment.freeFlowSpeed || 0);
  const currentSpeed = Number(segment.currentSpeed || 0);
  const confidence = Number(segment.confidence || 0);

  const congestionRatio = freeFlowSpeed > 0 ? currentSpeed / freeFlowSpeed : null;

  return {
    available: true,
    source: "tomtom",
    currentSpeedKph: currentSpeed,
    freeFlowSpeedKph: freeFlowSpeed,
    confidence,
    congestionRatio,
    roadClosure: Boolean(segment.roadClosure),
    frc: segment.frc || null,
  };
};

export const execute = async (params = {}) => {
  const from = String(params.from || params.origin || "").trim();
  const to = String(params.to || params.destination || "").trim();

  if (!from || !to) {
    return {
      type: "traffic",
      success: false,
      error: "Missing required parameters: from and to.",
      missingFields: [
        ...(!from ? ["from"] : []),
        ...(!to ? ["to"] : []),
      ],
    };
  }

  const fromGeo = await geocode(from);
  const toGeo = await geocode(to);

  if (!fromGeo || !toGeo) {
    return {
      type: "traffic",
      success: false,
      error: "I could not resolve one or both locations.",
    };
  }

  const route = await fetchRoute({ from: fromGeo, to: toGeo });
  const midpoint = {
    lat: (fromGeo.lat + toGeo.lat) / 2,
    lng: (fromGeo.lng + toGeo.lng) / 2,
  };

  const traffic = await fetchTomTomTraffic(midpoint);

  return {
    type: "traffic",
    success: true,
    from: fromGeo,
    to: toGeo,
    distanceKm: Number((route.distanceMeters / 1000).toFixed(2)),
    durationMinutes: Number((route.durationSeconds / 60).toFixed(1)),
    mapUrl: buildMapUrl({
      fromLat: fromGeo.lat,
      fromLng: fromGeo.lng,
      toLat: toGeo.lat,
      toLng: toGeo.lng,
    }),
    traffic,
  };
};

export const schema = {
  name: "traffic",
  description:
    "Get driving route distance/time between two places and optional live traffic data (TomTom when configured).",
  actions: ["route"],
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["route"],
      },
      from: {
        type: "string",
        description: "Origin place or address.",
      },
      to: {
        type: "string",
        description: "Destination place or address.",
      },
      origin: {
        type: "string",
        description: "Alias for from.",
      },
      destination: {
        type: "string",
        description: "Alias for to.",
      },
    },
    required: ["from", "to"],
  },
};
