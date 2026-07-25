import { google } from "googleapis";
import { getContext, saveContext } from "../memory/supabaseMemory.js";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
];

const getRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI
  || (process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/google/oauth/callback` : null);

const requireClientConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI (or PUBLIC_APP_URL).");
  }

  return { clientId, clientSecret, redirectUri };
};

const createOAuthClient = () => {
  const { clientId, clientSecret, redirectUri } = requireClientConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const authContextKey = "google_oauth";

const readStoredTokens = async ({ sessionId = "default", userId = null }) => {
  if (!sessionId && !userId) return null;
  const stored = await getContext(sessionId || "default", authContextKey, userId || null);
  if (!stored || typeof stored !== "object") return null;
  return stored;
};

export const getGoogleAuthStatus = async ({ sessionId = "default", userId = null } = {}) => {
  const stored = await readStoredTokens({ sessionId, userId });
  const hasRefreshToken = Boolean(stored?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN);
  return {
    connected: hasRefreshToken,
    sessionId,
    userId,
    scopes: GOOGLE_SCOPES,
    redirectUri: getRedirectUri(),
  };
};

export const buildGoogleConnectUrl = async ({ sessionId = "default", userId = null } = {}) => {
  const oauth2Client = createOAuthClient();
  const state = Buffer.from(JSON.stringify({ sessionId, userId }), "utf8").toString("base64url");
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
  return { url, sessionId, userId, scopes: GOOGLE_SCOPES };
};

export const exchangeGoogleCode = async ({ code, state } = {}) => {
  if (!code) throw new Error("Missing OAuth code.");
  const oauth2Client = createOAuthClient();

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens) throw new Error("Google OAuth token exchange failed.");

  let sessionId = "default";
  let userId = null;

  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
      sessionId = parsed.sessionId || sessionId;
      userId = parsed.userId || null;
    } catch {
      // Ignore malformed state and keep defaults.
    }
  }

  const refreshToken = tokens.refresh_token || process.env.GOOGLE_REFRESH_TOKEN || null;
  if (!refreshToken) {
    throw new Error("Google OAuth did not return a refresh token. Reconnect with prompt=consent and access_type=offline.");
  }

  await saveContext(sessionId, authContextKey, {
    refresh_token: refreshToken,
    scope: tokens.scope || GOOGLE_SCOPES.join(" "),
    connected_at: new Date().toISOString(),
  }, userId);

  return {
    success: true,
    sessionId,
    userId,
    scopes: tokens.scope || GOOGLE_SCOPES.join(" "),
  };
};

export const getGoogleClients = async ({ sessionId = "default", userId = null } = {}) => {
  const oauth2Client = createOAuthClient();
  const stored = await readStoredTokens({ sessionId, userId });
  const refreshToken = stored?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error("Google account is not connected. Open /api/google/connect-url (or call function googleConnectUrl) and authorize first.");
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return {
    auth: oauth2Client,
    gmail: google.gmail({ version: "v1", auth: oauth2Client }),
    calendar: google.calendar({ version: "v3", auth: oauth2Client }),
  };
};

export const getGoogleOAuthInfo = () => ({
  redirectUri: getRedirectUri(),
  scopes: GOOGLE_SCOPES,
});
