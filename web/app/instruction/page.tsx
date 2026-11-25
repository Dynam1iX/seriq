"use client";

import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { useLang } from "@/lib/i18n";

export default function Instruction() {
  const [lang, setLang, t] = useLang();
  const steps = [t.step1, t.step2, t.step3];
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-xl flex-col gap-5 p-6 text-slate-900">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-lg text-slate-500 underline">
            ← {t.back}
          </Link>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>

        <h1 className="text-3xl font-bold">{t.instrTitle}</h1>

        <video
          src="/demo/complete_test_08.mp4"
          controls
          autoPlay
          muted
          loop
          playsInline
          className="w-full rounded-2xl bg-black"
        />
        <p className="text-sm text-slate-400">{t.videoSource}</p>

        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-4 rounded-2xl bg-slate-100 p-4 text-xl">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <p className="rounded-2xl bg-amber-50 p-4 text-xl font-semibold text-amber-900">⚠ {t.stopIfPain}</p>

        <Link href="/train" className="rounded-2xl bg-blue-600 px-6 py-5 text-center text-2xl font-semibold text-white">
          {t.ready}
        </Link>
      </div>
    </main>
  );
}
