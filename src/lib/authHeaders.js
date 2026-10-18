export const getAuthHeaders = async (headers = {}) => {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return {
    ...headers,
    Authorization: `Bearer ${data.session.access_token}`,
  };
};
