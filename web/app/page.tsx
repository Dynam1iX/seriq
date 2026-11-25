"use client";

import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { useLang } from "@/lib/i18n";

export default function Home() {
  const [lang, setLang, t] = useLang();
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6 text-ink">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-clay-700">SerIQ</span>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>

        <div>
          <h1 className="text-4xl font-bold">{t.exercise}</h1>
          <p className="mt-2 text-xl text-stone-600">{t.tagline}</p>
        </div>

        <Link href="/instruction" className="rounded-2xl bg-clay-600 px-6 py-5 text-center text-2xl font-semibold text-white">
          {t.start}
        </Link>
        <Link
          href="/train"
          className="rounded-2xl border-2 border-clay-600 px-6 py-4 text-center text-xl font-semibold text-clay-700"
        >
          {t.tryDemo}
        </Link>

        <p className="rounded-2xl bg-sage-50 p-4 text-lg text-sage-900">🔒 {t.privacy}</p>
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900">{t.disclaimer}</p>

        <Link href="/about" className="text-center text-lg text-stone-500 underline">
          {t.about}
        </Link>
      </div>
    </main>
  );
}
