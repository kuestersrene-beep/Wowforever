import { createBrowserClient } from "@supabase/ssr";

// Client für Client Components (läuft im Browser). Verwendet den
// öffentlichen "anon key" – der ist sicher im Browser sichtbar, weil
// Row Level Security in der Datenbank den Zugriff einschränkt.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
