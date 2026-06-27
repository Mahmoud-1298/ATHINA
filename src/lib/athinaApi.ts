export interface AgentLocateAction {
  type: "locate";
  query: string;
  success: boolean;
  name?: string;
  lat?: number;
  lng?: number;
  mapUrl?: string;
  error?: string;
}

export interface AgentBrowseAction {
  type: "browse";
  query?: string;
  success: boolean;
  url?: string;
  title?: string;
  summary?: string;
  sources?: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  embedBlocked?: boolean;
  fetchedAt?: string;
  error?: string;
}

export type AgentAction = AgentLocateAction | AgentBrowseAction;

export interface AgentResponse {
  success: boolean;
  reply: string;
  actions: AgentAction[];
  sessionId: string;
  timestamp: string;
}

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

const getFetchError = (url: string, response: Response, body: any) => {
  const details = body?.details || body?.error || response.statusText || "Unknown error";
  return new Error(
    `Failed to fetch ${url}: ${details} (${response.status}).\n` +
    `Front-end backend URL is ${BACKEND_BASE_URL}. Set VITE_BACKEND_URL in your frontend environment.`
  );
};

const parseJsonSafe = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const sendAgentMessage = async (
  message: string,
  sessionId = "ui-session",
  mode: "text" | "voice" = "text"
): Promise<AgentResponse> => {
  const url = `${BACKEND_BASE_URL}/api/agent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, mode }),
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw getFetchError(url, response, data);
  }

  return data;
};

export const sendVoiceMessage = async (audioBase64: string, sessionId = "ui-session") => {
  const response = await fetch(`${BACKEND_BASE_URL}/api/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64, sessionId }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.details || data?.error || "Voice backend request failed");
  }

  return data;
};

export const speakText = async (text: string) => {
  const response = await fetch(`${BACKEND_BASE_URL}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.details || data?.error || "Speech synthesis failed");
  }

  return data as { success: boolean; audioBase64: string | null };
};
