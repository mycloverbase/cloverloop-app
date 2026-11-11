import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/config";

export function createSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Supabase admin client is not configured.", {
      missing: [
        ...(!url ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
        ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
      ],
    });
    return null;
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
