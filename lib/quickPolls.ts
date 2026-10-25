import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuickPollResult } from "@/lib/types";

interface PollRow {
  id: string;
  question: string;
  active: boolean;
  created_at: string;
}

interface OptionRow {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
}

interface VoteRow {
  poll_id: string;
  user_id: string;
  option_id: string;
}

// Lädt Kurzabstimmungen samt Stimmen je Antwort. onlyActive für die
// Startseite, sonst alle (Admin-Dashboard). Für nicht eingeloggte
// Besucher liefert RLS keine Stimmen - dann stehen überall 0 Stimmen.
// Fehler (z. B. Schema noch nicht eingespielt) ergeben eine leere Liste.
export async function loadQuickPolls(
  supabase: SupabaseClient,
  userId: string | null,
  onlyActive: boolean
): Promise<QuickPollResult[]> {
  let pollQuery = supabase
    .from("quick_polls")
    .select("id, question, active, created_at")
    .order("created_at", { ascending: false });
  if (onlyActive) pollQuery = pollQuery.eq("active", true);

  const { data: polls, error } = await pollQuery.returns<PollRow[]>();
  if (error || !polls || polls.length === 0) return [];

  const ids = polls.map((p) => p.id);
  const [{ data: options }, { data: votes }] = await Promise.all([
    supabase
      .from("quick_poll_options")
      .select("id, poll_id, label, sort_order")
      .in("poll_id", ids)
      .order("sort_order", { ascending: true })
      .returns<OptionRow[]>(),
    supabase
      .from("quick_poll_votes")
      .select("poll_id, user_id, option_id")
      .in("poll_id", ids)
      .returns<VoteRow[]>(),
  ]);

  return polls.map((poll) => {
    const pollVotes = (votes ?? []).filter((v) => v.poll_id === poll.id);
    return {
      ...poll,
      options: (options ?? [])
        .filter((o) => o.poll_id === poll.id)
        .map((o) => ({
          id: o.id,
          label: o.label,
          votes: pollVotes.filter((v) => v.option_id === o.id).length,
        })),
      totalVotes: pollVotes.length,
      myVote: pollVotes.find((v) => v.user_id === userId)?.option_id ?? null,
    };
  });
}
