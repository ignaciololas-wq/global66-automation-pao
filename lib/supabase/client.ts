// Supabase client browser — usado en Client Components.
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config';

let _client: ReturnType<typeof createBrowserClient> | null = null;
export function createClient() {
  if (_client) return _client;
  _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}
