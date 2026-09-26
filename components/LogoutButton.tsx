"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/LocaleProvider";

export default function LogoutButton() {
  const router = useRouter();
  const { dict } = useI18n();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="rounded-md border border-gold/30 px-3 py-1.5 text-sm text-parchment transition hover:bg-gold/10"
    >
      {dict.logout.label}
    </button>
  );
}
