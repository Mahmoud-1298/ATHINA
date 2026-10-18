import { createClient } from "@supabase/supabase-js";

let authClient;

const getAuthClient = () => {
  if (authClient) return authClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return authClient;
};

export const createAuthMiddleware = (verifyAccessToken) =>
  async (req, res, next) => {
    const authorization = req.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    try {
      const user = await verifyAccessToken(match[1]);
      if (!user?.id) {
        return res.status(401).json({
          success: false,
          error: "Invalid or expired access token",
        });
      }

      req.auth = { user };
      req.body = {
        ...(req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? req.body
          : {}),
        userId: user.id,
      };
      return next();
    } catch (error) {
      console.error("[AUTH] Token verification failed:", error?.message || error);
      return res.status(503).json({
        success: false,
        error: "Authentication service unavailable",
      });
    }
  };

export const requireAuth = createAuthMiddleware(async (accessToken) => {
  const client = getAuthClient();
  if (!client) {
    throw new Error("Supabase Auth is not configured");
  }

  const { data, error } = await client.auth.getUser(accessToken);
  if (error) return null;
  return data.user;
});
