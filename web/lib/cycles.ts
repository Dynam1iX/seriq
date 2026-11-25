/**
 * Выделение циклов из непрерывного видео камеры (гистерезис по «верху» и «низу» движения).
 *
 *  ПОКОЙ:    помним «верх» — самое высокое положение руки с конца прошлого цикла.
 *            Рука опустилась ниже «верха» больше чем на START_DEG -> ДВИЖЕНИЕ.
 *  ДВИЖЕНИЕ: помним «низ». Цикл закончен, если:
 *            рука поднялась от «низа» на половину глубины (но не меньше RETURN_MIN_DEG)
 *            ИЛИ рука стоит неподвижно STILL_SEC ИЛИ прошло MAX_SEC.
 *  После цикла «верх» = текущее положение, и всё повторяется.
 * Сигнал предварительно сглаживается медианой 5 последних кадров, сбои детектора (скачок > 30°) пропускаются.
 */
import type { Sample } from "./features";

const START_DEG = 12;       // неполные движения в датасете ~15-30°, дрожание кисти с камеры ±3-5°
const RETURN_MIN_DEG = 8;
const STILL_SEC = 3;
const STILL_DEG = 4;
const MAX_SEC = 25;
const PRE_SEC = 1.5;        // в цикл включаем 1.5 c до начала движения — как в видео датасета
const GLITCH_DEG = 30;

type State = "idle" | "moving";

export class CycleDetector {
  private buf: Sample[] = [];
  private raw: number[] = [];      // последние 5 значений угла для медианы
  private state: State = "idle";
  private top: number | null = null;
  private topT = 0;
  private bottom = 0;
  private cycleStartT = 0;
  private stillRef = 0;
  private stillSinceT = 0;

  /** Добавить кадр. Возвращает кадры законченного цикла или null. */
  push(s: Sample): Sample[] | null {
    this.buf.push(s);
    while (this.buf.length && this.buf[0].t < s.t - 40) this.buf.shift();
    if (s.incl === null || s.vis < 0.5) return null;

    // сбой детектора кисти (запястье и костяшки поменялись местами на 1-3 кадра)
    if (this.raw.length >= 3) {
      const m = [...this.raw].sort((a, b) => a - b)[this.raw.length >> 1];
      if (Math.abs(s.incl - m) > GLITCH_DEG) return null;
    }
    this.raw.push(s.incl);
    if (this.raw.length > 5) this.raw.shift();
    const v = [...this.raw].sort((a, b) => a - b)[this.raw.length >> 1]; // сглаженный угол

    if (this.state === "idle") {
      if (this.top === null || v >= this.top) {
        this.top = v;
        this.topT = s.t;
      }
      if (this.top - v > START_DEG) {
        this.state = "moving";
        this.cycleStartT = Math.max(this.topT - PRE_SEC, this.buf[0].t);
        this.bottom = v;
        this.stillRef = v;
        this.stillSinceT = s.t;
      }
      return null;
    }

    // moving
    this.bottom = Math.min(this.bottom, v);
    if (Math.abs(v - this.stillRef) > STILL_DEG) {
      this.stillRef = v;
      this.stillSinceT = s.t;
    }
    const depth = this.top! - this.bottom;
    const returned = v - this.bottom >= Math.max(RETURN_MIN_DEG, depth / 2);
    const still = s.t - this.stillSinceT >= STILL_SEC && depth > START_DEG;
    const tooLong = s.t - this.cycleStartT >= MAX_SEC;
    if (returned || still || tooLong) {
      const cycle = this.buf.filter((x) => x.t >= this.cycleStartT);
      this.state = "idle";
      this.top = v; // новый «верх» — откуда рука сейчас
      this.topT = s.t;
      return cycle;
    }
    return null;
  }

  /** Занятие закончено посреди движения — отдать то, что есть, как цикл. */
  flush(): Sample[] | null {
    if (this.state !== "moving") return null;
    this.state = "idle";
    return this.buf.filter((x) => x.t >= this.cycleStartT);
  }

  reset() {
    this.buf = [];
    this.raw = [];
    this.state = "idle";
    this.top = null;
  }
}
