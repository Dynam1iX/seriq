"use client";

import type { Lang } from "@/lib/i18n";

export function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const btn = (l: Lang, label: string) => (
    <button
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      className={`rounded-full px-4 py-2 text-base font-semibold ${
        lang === l ? "bg-violet-600 text-white" : "bg-white shadow-card text-zinc-700"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2">
      {btn("kk", "Қазақша")}
      {btn("ru", "Русский")}
    </div>
  );
}
