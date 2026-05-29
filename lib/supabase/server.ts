// Supabase clients para server components + route handlers.
// - createServerClient: respeta cookies del request, RLS aplicado con JWT user.
// - createAdminClient: service_role, bypassea RLS (uso server-only).

import { createServerClient as createSSRClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
// NOTA: lib/database.types.ts (Database) tiene los tipos generados del schema.
// Tiparlo en createAdminClient<Database> dispara cascada de errores en los
// inserts/updates dinámicos (Record<string,any>) del data layer. Migración a
// cliente tipado = tarea aparte (castear cada insert). Por ahora reference.
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} from '@/lib/config';

export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components no pueden setear cookies — solo Route Handlers / Server Actions.
        }
      },
    },
  });
}

let _adminClient: SupabaseClient<any, any, any> | null = null;
export function createAdminClient(): SupabaseClient<any, any, any> {
  if (_adminClient) return _adminClient;
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada');
  }
  _adminClient = createClient<any, any, any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _adminClient;
}
