"use client";

/**
 * Сводка занятия (пункт 4 ТЗ): число циклов, их классы и график «коридор движения».
 * Коридор = диапазон (10–90 перцентиль) кривых всех полных движений из train-части датасета (public/corridor.json).
 */
import { useEffect, useState } from "react";
import type { Texts } from "@/lib/i18n";
import { clearHistory, loadHistory, type SessionRecord } from "@/lib/history";

export type SummaryCycle = { n: number; result: "done" | "check"; curve: number[] };
type Corridor = { points: number; p10: number[]; p50: number[]; p90: number[] };

const W = 600;
const H = 240;
const PAD = { l: 44, r: 10, t: 10, b: 30 };

function resample(a: number[], n: number): number[] {
  if (a.length === 0) return [];
  if (a.length === 1) return Array(n).fill(a[0]);
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (a.length - 1);
    const lo = Math.floor(x);
    const hi = Math.min(a.length - 1, lo + 1);
    return a[lo] + (a[hi] - a[lo]) * (x - lo);
  });
}

export function SessionSummary({
  cycles,
  t,
  historyVersion,
}: {
  cycles: SummaryCycle[];
  t: Texts;
  historyVersion: number;
}) {
  const [corridor, setCorridor] = useState<Corridor | null>(null);
  const [history, setHistory] = useState<SessionRecord[]>([]);

  useEffect(() => {
    fetch("/corridor.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setCorridor)
      .catch(() => setCorridor(null));
  }, []);
  useEffect(() => setHistory(loadHistory()), [historyVersion]);

  const done = cycles.filter((c) => c.result === "done").length;
  const n = corridor?.points ?? 64;
  const curves = cycles.map((c) => ({ ...c, pts: resample(c.curve, n) }));
  const yMax = Math.max(100, ...curves.flatMap((c) => c.pts), ...(corridor?.p90 ?? [0]));
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const line = (pts: number[]) => pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <section className="mt-6 rounded-3xl border-2 border-lavender-200 p-4">
      <h2 className="mb-3 text-2xl font-bold">{t.summaryTitle}</h2>

      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-3xl bg-white shadow-card p-3">
          <div className="text-sm text-zinc-500">{t.total}</div>
          <div className="text-4xl font-extrabold tracking-tight">{cycles.length}</div>
        </div>
        <div className="rounded-3xl bg-mint-50 p-3 text-mint-900">
          <div className="text-sm">{t.doneCount}</div>
          <div className="text-4xl font-extrabold tracking-tight">{done}</div>
        </div>
        <div className="rounded-3xl bg-white shadow-card p-3 text-zinc-800">
          <div className="text-sm">{t.checkCount}</div>
          <div className="text-4xl font-extrabold tracking-tight">{cycles.length - done}</div>
        </div>
      </div>

      {cycles.length > 0 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.corridorLegend}>
            {[0, 30, 60, 90].map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#ecebff" />
                <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#8b8aa3">
                  {v}°
                </text>
              </g>
            ))}
            {corridor && (
              <>
                <polygon
                  points={[
                    ...corridor.p90.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`),
                    ...corridor.p10.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse(), // нижняя граница справа налево
                  ].join(" ")}
                  fill="#e4e1ff"
                  opacity="0.7"
                />
                <polyline points={line(corridor.p50)} fill="none" stroke="#7b6cf6" strokeDasharray="6 4" strokeWidth="2" />
              </>
            )}
            {curves.map((c) => (
              <polyline
                key={c.n}
                points={line(c.pts)}
                fill="none"
                stroke={c.result === "done" ? "#2f9e6e" : "#7b6cf6"}
                strokeWidth="3"
                opacity="0.9"
              />
            ))}
            <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="12" fill="#8b8aa3">
              {t.axisX} →
            </text>
            <text x={PAD.l + 4} y={PAD.t + 12} fontSize="12" fill="#8b8aa3">
              ↑ {t.axisY}
            </text>
          </svg>
          <p className="mt-2 text-sm text-zinc-500">{t.corridorLegend}</p>
        </>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-lg font-semibold">{t.history}</h3>
          <ul className="space-y-1 text-base text-zinc-700">
            {history.map((h, i) => (
              <li key={i}>
                {h.date}: {t.total.toLowerCase()} {h.total}, {t.doneCount.toLowerCase()} {h.done}, {t.checkCount.toLowerCase()}{" "}
                {h.check}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-sm text-zinc-500">🔒 {t.storedLocally}</p>
      <button
        onClick={() => {
          clearHistory();
          setHistory([]);
        }}
        className="mt-2 text-base text-zinc-500 underline"
      >
        {t.deleteData}
      </button>
    </section>
  );
}
