import { cookies } from "next/headers";
import { de } from "./de";
import { en } from "./en";
import type { Dictionary, Locale } from "./types";

export const LOCALE_COOKIE = "locale";

const dictionaries: Record<Locale, Dictionary> = { de, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return store.get(LOCALE_COOKIE)?.value === "en" ? "en" : "de";
}

export type { Dictionary, Locale };
