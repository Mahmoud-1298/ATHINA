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

export const BACKEND_BASE_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export const sendAgentMessage = async (
  message: string,
  sessionId = "ui-session",
  mode: "text" | "voice" = "text"
): Promise<AgentResponse> => {
  const response = await fetch(`${BACKEND_BASE_URL}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, mode }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.details || data?.error || "ATHINA backend request failed");
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
