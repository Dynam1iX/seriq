/**
 * Выделение циклов из непрерывного видео (камера или длинный ролик).
 * ПОКОЙ -> (предплечье опустилось > 10° от исходного) -> ДВИЖЕНИЕ
 * ДВИЖЕНИЕ -> конец цикла, если: рука вернулась (< 5°) ИЛИ стоит неподвижно 3 c ИЛИ прошло 20 c.
 * После конца ждём возврата руки вверх, чтобы обратный ход не посчитался новым циклом.
 */
import type { Sample } from "./features";

const START_DEG = 10;   // неполные движения в датасете бывают всего ~18-25°
const END_DEG = 5;
const GLITCH_DEG = 30;  // кадр, отличающийся от медианы 5 последних больше чем на 30°, — сбой детектора, пропускаем
const STILL_SEC = 3;
const STILL_DEG = 3;
const MAX_SEC = 20;
const PRE_SEC = 1.5; // в цикл включаем 1.5 c покоя до движения — как в видео датасета (иначе «верх» занижается)

type State = "idle" | "moving" | "cooldown";

export class CycleDetector {
  private buf: Sample[] = [];
  private state: State = "idle";
  private baseline: number | null = null;
  private cycleStartT = 0;
  private stillSinceT = 0;
  private stillRef = 0;
  private recent: number[] = [];
  private lowSinceT: number | null = null;

  /** Добавить кадр. Возвращает кадры законченного цикла или null. */
  push(s: Sample): Sample[] | null {
    this.buf.push(s);
    // держим в памяти только последние 30 c
    const cutoff = s.t - 30;
    while (this.buf.length && this.buf[0].t < cutoff) this.buf.shift();
    if (s.incl === null || s.vis < 0.5) return null;
    // защита от сбоев детектора кисти (запястье и костяшки на 1-3 кадра меняются местами)
    if (this.recent.length >= 3) {
      const m = [...this.recent].sort((a, b) => a - b)[this.recent.length >> 1];
      if (Math.abs(s.incl - m) > GLITCH_DEG) return null;
    }
    this.recent.push(s.incl);
    if (this.recent.length > 5) this.recent.shift();

    if (this.state === "idle") {
      // Исходное положение обновляем только когда рука СТОИТ (разброс за 1 c < 5°).
      // Иначе при медленном движении «исходное» ползло бы за рукой и цикл не начался бы никогда.
      const recent = this.buf
        .filter((x) => x.t >= s.t - 1 && x.incl !== null && x.vis >= 0.5)
        .map((x) => x.incl as number)
        .sort((a, b) => a - b);
      const steady = recent.length >= 5 && recent[recent.length - 1] - recent[0] < 5;
      if (steady) {
        const m = recent[recent.length >> 1];
        // «верх» поднимаем сразу (люди часто сначала поднимают руку выше), опускаем — только если рука стоит ниже 3 c
        if (this.baseline === null || m > this.baseline) {
          this.baseline = m;
          this.lowSinceT = null;
        } else if (this.baseline - m > START_DEG / 2) {
          if (this.lowSinceT === null) this.lowSinceT = s.t;
          else if (s.t - this.lowSinceT >= 3) { this.baseline = m; this.lowSinceT = null; }
        }
      }
      if (this.baseline === null) return null;
      if (this.baseline - s.incl > START_DEG) {
        this.state = "moving";
        this.cycleStartT = s.t - PRE_SEC;
        this.stillSinceT = s.t;
        this.stillRef = s.incl;
      }
      return null;
    }

    if (this.state === "moving") {
      const ext = this.baseline! - s.incl;
      if (Math.abs(s.incl - this.stillRef) > STILL_DEG) {
        this.stillRef = s.incl;
        this.stillSinceT = s.t;
      }
      const returned = ext < END_DEG;
      const still = s.t - this.stillSinceT >= STILL_SEC;
      const tooLong = s.t - this.cycleStartT >= MAX_SEC;
      if (returned || still || tooLong) {
        const cycle = this.buf.filter((x) => x.t >= this.cycleStartT);
        this.state = returned ? "idle" : "cooldown";
        return cycle;
      }
      return null;
    }

    // cooldown: ждём, пока рука вернётся к исходному положению
    if (this.baseline! - s.incl < START_DEG) this.state = "idle";
    return null;
  }

  /** Видео закончилось посреди движения — отдать то, что есть, как цикл. */
  flush(): Sample[] | null {
    if (this.state !== "moving") return null;
    this.state = "idle";
    return this.buf.filter((x) => x.t >= this.cycleStartT);
  }

  reset() {
    this.buf = [];
    this.recent = [];
    this.state = "idle";
    this.baseline = null;
    this.lowSinceT = null;
  }
}
