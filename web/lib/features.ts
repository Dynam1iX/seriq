/**
 * Признаки цикла — копия ml/features.py (cycle_features). Менять только вместе!
 * На вход — кадры одного цикла: время (с), наклон предплечья/кулака (°) или null, уверенность трекинга.
 */
export type Sample = { t: number; incl: number | null; vis: number };
export type Features = Record<string, number>;

const VIS_OK = 0.5;
const OUTLIER_DEG = 30;

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Медианный фильтр, края = повтор крайнего (как scipy median_filter mode="nearest"). */
function medianFilter(a: number[], size: number): number[] {
  const n = a.length;
  const h = size >> 1;
  return a.map((_, i) => {
    const w: number[] = [];
    for (let k = -h; k <= h; k++) w.push(a[Math.min(n - 1, Math.max(0, i + k))]);
    return median(w);
  });
}

/** Перцентиль с линейной интерполяцией (как numpy.percentile по умолчанию). */
function percentile(a: number[], q: number): number {
  const s = [...a].sort((x, y) => x - y);
  const pos = (q / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function cycleFeatures(samples: Sample[]): { f: Features; ext: number[]; t: number[] } | null {
  const okMask = samples.map((s) => s.vis >= VIS_OK && s.incl !== null && Number.isFinite(s.incl));
  const validFrac = samples.length ? okMask.filter(Boolean).length / samples.length : 0;
  let ok = samples.filter((_, i) => okMask[i]);
  if (ok.length < 5) return null;

  // 1) выбросы: кадр отличается от медианы соседей (окно 9) больше чем на 30°
  const raw = ok.map((s) => s.incl as number);
  const med9 = medianFilter(raw, 9);
  ok = ok.filter((_, i) => Math.abs(raw[i] - med9[i]) <= OUTLIER_DEG);
  if (ok.length < 5) return null;

  const t = ok.map((s) => s.t);
  const vis = ok.map((s) => s.vis);
  // 2) сглаживание
  const inc = medianFilter(ok.map((s) => s.incl as number), 5);

  // 3) устойчивые верх и низ движения
  const top = percentile(inc, 95);
  const low = percentile(inc, 5);
  const ext = inc.map((x) => Math.max(0, top - x));
  const rom = top - low;
  let iPeak = 0;
  ext.forEach((x, i) => { if (x > ext[iPeak]) iPeak = i; });

  const dt = t.slice(1).map((x, i) => x - t[i]);
  const v: number[] = [];
  for (let i = 0; i < dt.length; i++) if (dt[i] > 0) v.push((ext[i + 1] - ext[i]) / dt[i]);
  const absV = v.map(Math.abs);
  const fast = v.filter((x) => Math.abs(x) > 15);
  let reversals = 0;
  for (let i = 1; i < fast.length; i++) if (Math.sign(fast[i]) !== Math.sign(fast[i - 1])) reversals++;
  const segDt = [...dt, dt.length ? dt[dt.length - 1] : 0];
  let hold = 0;
  ext.forEach((x, i) => { if (x >= rom - 10) hold += segDt[i]; });

  const mean = (a: number[]) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : 0);
  const f: Features = {
    rom,
    low,
    t_peak: t[iPeak] - t[0],
    duration: t[t.length - 1] - t[0],
    v_peak: absV.length ? Math.max(...absV) : 0,
    v_mean: mean(absV),
    hold,
    frac45: ext.filter((x) => x > 45).length / ext.length,
    reversals,
    vis_mean: mean(vis),
    valid_frac: validFrac,
  };
  return { f, ext, t };
}
