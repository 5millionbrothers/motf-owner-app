import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabaseClient() {
  if (client !== undefined) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const configured =
    Boolean(url?.startsWith("https://")) &&
    Boolean(url?.includes(".supabase.co")) &&
    Boolean(publishableKey) &&
    !publishableKey?.includes("붙여넣기");

  client = configured ? createClient(url!, publishableKey!) : null;
  return client;
}
