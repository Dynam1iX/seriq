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
          <span className="text-2xl font-bold text-violet-700">SerIQ</span>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>

        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">{t.exercise}</h1>
          <p className="mt-2 text-xl text-zinc-600">{t.tagline}</p>
        </div>

        <Link href="/instruction" className="rounded-full bg-violet-600 shadow-button hover:bg-violet-700 px-6 py-5 text-center text-2xl font-semibold text-white">
          {t.start}
        </Link>
        <Link
          href="/train"
          className="rounded-full border-2 border-violet-600 bg-white px-6 py-4 text-center text-xl font-semibold text-violet-700"
        >
          {t.tryDemo}
        </Link>

        <p className="rounded-3xl bg-mint-50 p-4 text-lg text-mint-900">🔒 {t.privacy}</p>
        <p className="rounded-3xl bg-amber-50 p-4 text-lg text-amber-900">{t.disclaimer}</p>

        <Link href="/about" className="text-center text-lg text-zinc-500 underline">
          {t.about}
        </Link>
      </div>
    </main>
  );
}
