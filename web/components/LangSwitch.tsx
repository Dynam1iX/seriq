"use client";

import type { Lang } from "@/lib/i18n";

export function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const btn = (l: Lang, label: string) => (
    <button
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      className={`rounded-xl px-4 py-2 text-lg font-semibold ${
        lang === l ? "bg-clay-600 text-white" : "bg-white/70 text-stone-700"
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
