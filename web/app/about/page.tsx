"use client";

/** «О модели» — для жюри и врача. Цифры — из REPORT.md (обучение ml/train.py). */
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { LangSwitch } from "@/components/LangSwitch";

export default function About() {
  const [lang, setLang, t] = useLang();
  const ru = lang === "ru";
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-6 text-slate-900">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-lg text-slate-500 underline">
            ← {t.back}
          </Link>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <h1 className="text-3xl font-bold">{t.about}</h1>

        <ol className="list-decimal space-y-1 pl-6 text-lg">
          {(ru
            ? [
                "Камера или видео → MediaPipe HandLandmarker находит 21 точку кисти.",
                "Ось кулака (запястье → костяшка среднего пальца) ≈ ось предплечья → угол наклона к столу.",
                "Ряд угла приводится к 15 точкам в секунду, выбросы детектора отбрасываются.",
                "Детектор выделяет циклы движения из непрерывного видео.",
                "5 признаков цикла (амплитуда, время до пика, средняя скорость, удержание, доля времени ниже 45°).",
                "Наша логистическая регрессия → вероятность «complete» → «Выполнено» или «Проверьте инструкцию».",
              ]
            : [
                "Камера немесе бейне → MediaPipe HandLandmarker қолдың 21 нүктесін табады.",
                "Жұдырық осі (білезік → ортаңғы саусақ буыны) ≈ білек осі → үстелге көлбеу бұрышы.",
                "Бұрыш қатары секундына 15 нүктеге келтіріледі, детектордың қателері алынып тасталады.",
                "Детектор үздіксіз бейнеден қозғалыс циклдерін бөледі.",
                "Циклдің 5 белгісі (амплитуда, шыңға дейінгі уақыт, орташа жылдамдық, ұстап тұру, 45°-тан төмен уақыт үлесі).",
                "Біздің логистикалық регрессия → «complete» ықтималдығы → «Орындалды» немесе «Нұсқаулықты тексеріңіз».",
              ]
          ).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>

        <div>
          <h2 className="mb-2 text-xl font-bold">{ru ? "Качество (видео E02, разбиение по людям)" : "Сапа (E02 бейнелері, адамдар бойынша бөлу)"}</h2>
          <table className="w-full text-left text-base">
            <thead>
              <tr className="border-b">
                <th className="py-1">{ru ? "Модель" : "Модель"}</th>
                <th>LOSO (01–05)</th>
                <th>Test (08)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-1">Baseline: {ru ? "порог по амплитуде" : "амплитуда шегі"}</td>
                <td>BA 1.00</td>
                <td>BA 1.00, F1 1.00</td>
              </tr>
              <tr className="border-b">
                <td className="py-1">{ru ? "Наша модель" : "Біздің модель"}</td>
                <td>BA 1.00</td>
                <td>BA 1.00, F1 1.00</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-base text-slate-600">
            {ru
              ? "Стресс-тест (24/30/60 кадров/с, дрожание 1,5–3°): 0 ошибок из 508. Подробно — REPORT.md в репозитории."
              : "Стресс-тест (секундына 24/30/60 кадр, 1,5–3° діріл): 508-ден 0 қате. Толығырақ — репозиторийдегі REPORT.md."}
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-bold">{ru ? "Ограничения" : "Шектеулер"}</h2>
          <ul className="list-disc space-y-1 pl-6 text-base text-slate-700">
            {(ru
              ? [
                  "В test один человек (20 видео) — нужен пилот с пациентами.",
                  "Добровольцы, а не пациенты: у пациентов возможны компенсаторные движения.",
                  "Лучше всего работает, когда камера сбоку на уровне стола.",
                  "Не медицинское изделие, не ставит диагнозов и не даёт медицинских советов.",
                ]
              : [
                  "Test-те бір адам (20 бейне) — пациенттермен пилот керек.",
                  "Пациенттер емес, еріктілер түсірілген: пациенттерде компенсаторлық қозғалыстар болуы мүмкін.",
                  "Камера үстел деңгейінде бүйірде тұрғанда жақсы жұмыс істейді.",
                  "Медициналық бұйым емес, диагноз қоймайды, медициналық кеңес бермейді.",
                ]
            ).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-slate-500">
          {ru ? "Данные" : "Деректер"}:{" "}
          <a className="underline" href="https://data.mendeley.com/datasets/49h9dcwx5v/1" target="_blank" rel="noreferrer">
            An upper limb stroke rehabilitation exercise video (Mendeley Data)
          </a>
          . MediaPipe — Apache 2.0.
        </p>
      </div>
    </main>
  );
}
