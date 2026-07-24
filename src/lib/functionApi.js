const BACKEND_ENV_URL = [
  import.meta.env.VITE_BACKEND_URL,
  import.meta.env.VITE_BACKEND_UR,
  import.meta.env.BACKEND_URL,
  import.meta.env.BACKEND_UR,
]
  .filter(Boolean)
  .map((value) => String(value).trim())
  .find(Boolean) || "";

const DEFAULT_BACKEND_URL = BACKEND_ENV_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const BACKEND_BASE_URL = DEFAULT_BACKEND_URL;

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const toError = (functionName, response, body) => {
  const details = body?.details || body?.error || response.statusText || "Unknown error";
  return new Error(
    `Function ${functionName} failed: ${details} (${response.status}). ` +
    `Backend URL: ${BACKEND_BASE_URL}`
  );
};

export const invokeFunction = async (functionName, payload = {}, options = {}) => {
  const _unusedOptions = options;
  void _unusedOptions;
  try {
    const response = await fetch(
      `${BACKEND_BASE_URL}/api/functions/${encodeURIComponent(functionName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      }
    );

    const data = await parseJsonSafe(response);
    if (!response.ok) throw toError(functionName, response, data);
    return { data };
  } catch (error) {
    throw error;
  }
};
