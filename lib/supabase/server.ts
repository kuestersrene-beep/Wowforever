import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client für Server Components, Server Actions und Route Handler.
// Nutzt ebenfalls den "anon key" + die Login-Cookies des Nutzers,
// damit Row Level Security weiterhin greift (der Nutzer sieht nur
// seine eigene Zeile).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Wird in Server Components aufgerufen, in denen Cookies nicht
            // gesetzt werden dürfen. Die Middleware kümmert sich in dem
            // Fall um das Session-Refresh – das hier kann ignoriert werden.
          }
        },
      },
    }
  );
}

// Admin-Client mit dem "service role key". Umgeht Row Level Security
// komplett – wird NUR serverseitig verwendet, und nur nachdem lib/admin.ts
// geprüft hat, dass der eingeloggte Nutzer wirklich ein Admin ist.
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Der Admin-Client verwaltet keine Nutzer-Session.
        },
      },
    }
  );
}
