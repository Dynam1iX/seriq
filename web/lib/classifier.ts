/**
 * Наша модель в браузере: читает public/model.json (его создаёт ml/train.py).
 * Возвращает только нейтральный результат — без медицинских советов.
 */
import type { Features } from "./features";

export type Model = {
  kind: "logreg" | "forest_m2cgen";
  features: string[];
  p_done: number;
  p_unsure: number;
  baseline_rom_threshold: number;
  mean?: number[];
  scale?: number[];
  coef?: number[];
  intercept?: number;
};

export type Verdict = {
  result: "done" | "check";   // «Выполнено» | «Проверьте инструкцию»
  unsure: boolean;            // показать «результат неточный, повторите»
  p: number;                  // уверенность модели, что цикл complete
  baselineSaysDone: boolean;  // для экрана «О модели»
};

export async function loadModel(): Promise<Model> {
  const r = await fetch("/model.json");
  if (!r.ok) throw new Error("model.json не найден — запусти ml/train.py");
  return r.json();
}

export function predict(model: Model, f: Features): Verdict {
  const x = model.features.map((name) => f[name] ?? 0);
  let p: number;
  if (model.kind === "logreg") {
    let z = model.intercept!;
    x.forEach((v, i) => (z += model.coef![i] * ((v - model.mean![i]) / model.scale![i])));
    p = 1 / (1 + Math.exp(-z));
  } else {
    throw new Error("Для леса подключи lib/forest.js (m2cgen) или выбери логрегрессию");
  }
  const poorTracking = (f.vis_mean ?? 1) < 0.6 || (f.valid_frac ?? 1) < 0.6;
  return {
    result: p >= model.p_done && !poorTracking ? "done" : "check",
    unsure: poorTracking || (p > model.p_unsure && p < model.p_done),
    p,
    baselineSaysDone: f.rom > model.baseline_rom_threshold,
  };
}
