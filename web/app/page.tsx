"use client";

import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { useLang } from "@/lib/i18n";

export default function Home() {
  const [lang, setLang, t] = useLang();
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6 text-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-blue-700">SerIQ</span>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>

        <div>
          <h1 className="text-4xl font-bold">{t.exercise}</h1>
          <p className="mt-2 text-xl text-slate-600">{t.tagline}</p>
        </div>

        <Link href="/instruction" className="rounded-2xl bg-blue-600 px-6 py-5 text-center text-2xl font-semibold text-white">
          {t.start}
        </Link>
        <Link
          href="/train"
          className="rounded-2xl border-2 border-blue-600 px-6 py-4 text-center text-xl font-semibold text-blue-700"
        >
          {t.tryDemo}
        </Link>

        <p className="rounded-2xl bg-emerald-50 p-4 text-lg text-emerald-900">🔒 {t.privacy}</p>
        <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900">{t.disclaimer}</p>

        <Link href="/about" className="text-center text-lg text-slate-500 underline">
          {t.about}
        </Link>
      </div>
    </main>
  );
}
