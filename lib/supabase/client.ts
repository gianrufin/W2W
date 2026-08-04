import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

/**
 * Browser-side Supabase client. Returns null when the project has not been
 * configured yet, which is the signal the data layer uses to fall back to the
 * bundled mock dataset.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
  }
  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}
