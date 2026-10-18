import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/functionApi";

const throwAuthError = (error) => {
  if (error) throw error;
};

export const authClient = {
  auth: {
    me: async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      throwAuthError(sessionError);
      if (!sessionData.session) return null;
      const { data, error } = await supabase.auth.getUser(sessionData.session.access_token);
      throwAuthError(error);
      return data.user;
    },
    logout: async (redirectTo) => {
      const { error } = await supabase.auth.signOut();
      throwAuthError(error);
      if (redirectTo) window.location.href = redirectTo;
    },
    redirectToLogin: (redirectTo) => {
      const next = redirectTo && new URL(redirectTo).origin === window.location.origin
        ? new URL(redirectTo).pathname + new URL(redirectTo).search
        : "/";
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    },
    loginViaEmailPassword: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      throwAuthError(error);
      if (!data.session) throw new Error("Sign-in did not create a session.");
      return data;
    },
    loginWithProvider: async (provider, redirectPath = "/") => {
      const redirectTo = new URL(redirectPath, window.location.origin).toString();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      throwAuthError(error);
    },
    resetPasswordRequest: async (email) => {
      const redirectTo = new URL("/reset-password", window.location.origin).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      throwAuthError(error);
    },
    register: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      throwAuthError(error);
      return data;
    },
    verifyOtp: async ({ email, otpCode }) => {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: "email",
      });
      throwAuthError(error);
      return data.session;
    },
    setToken: async (accessToken, refreshToken) => {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      throwAuthError(error);
    },
    resendOtp: async (email) => {
      const { error } = await supabase.auth.resend({ email, type: "signup" });
      throwAuthError(error);
    },
    resetPassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      throwAuthError(error);
    },
  },
  functions: {
    invoke: (name, payload) => invokeFunction(name, payload),
  },
};
