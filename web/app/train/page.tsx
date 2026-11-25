"use client";

/**
 * SerIQ — страница тренировки.
 * Камера или видео -> MediaPipe HandLandmarker -> ось кулака (запястье -> костяшка среднего пальца)
 * -> угол наклона -> циклы -> наша модель -> «Выполнено» / «Проверьте инструкцию» -> сводка занятия.
 * Видео никуда не отправляется: всё считается в браузере.
 *
 * Файлы в public/: models/hand_landmarker.task, mediapipe/wasm/*, model.json, corridor.json, demo/*.mp4
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { HAND, inclination } from "@/lib/angles";
import { cycleFeatures, type Sample } from "@/lib/features";
import { CycleDetector } from "@/lib/cycles";
import { loadModel, predict, type Model, type Verdict } from "@/lib/classifier";
import { useLang } from "@/lib/i18n";
import { saveSession } from "@/lib/history";
import { LangSwitch } from "@/components/LangSwitch";
import { SessionSummary } from "@/components/SessionSummary";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/models/hand_landmarker.task";
const SCORE_OK = 0.5;

type CycleResult = Verdict & { n: number; rom: number; curve: number[] };
type Source = "none" | "camera" | "file";
type Status = "loading" | "ready" | "noModel" | "cameraDenied" | "badVideo" | "error";

export default function TrainPage() {
  const [lang, setLang, t] = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const modelRef = useRef<Model | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const sourceRef = useRef<Source>("none");
  const samplesRef = useRef<Sample[]>([]);
  const detectorRef = useRef(new CycleDetector());

  const [status, setStatus] = useState<Status>("loading");
  const [source, setSource] = useState<Source>("none");
  const [incl, setIncl] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [cycles, setCycles] = useState<CycleResult[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [saveTick, setSaveTick] = useState(0);
  const pendingSaveRef = useRef(false);

  // Сохранение итога занятия (только на устройстве) — после того, как последний цикл попал в состояние
  useEffect(() => {
    if (!pendingSaveRef.current) return;
    pendingSaveRef.current = false;
    if (!cycles.length) return;
    const done = cycles.filter((x) => x.result === "done").length;
    saveSession({ date: new Date().toLocaleString(), total: cycles.length, done, check: cycles.length - done });
    setHistoryVersion((v) => v + 1);
  }, [cycles, saveTick]);

  // 1. Загрузка моделей (один раз)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      const make = (delegate: "GPU" | "CPU") =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
      let lm: HandLandmarker;
      try {
        lm = await make("GPU");
      } catch {
        lm = await make("CPU"); // на слабых устройствах GPU может не быть
      }
      if (cancelled) return lm.close();
      landmarkerRef.current = lm;
      try {
        modelRef.current = await loadModel();
      } catch (e) {
        console.warn(e);
      }
      setStatus(modelRef.current ? "ready" : "noModel");
    })().catch((e) => {
      console.error(e);
      setStatus("error");
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      stopCamera();
    };
  }, []);

  // 2. Цикл -> признаки -> наша модель -> нейтральный результат
  const finishCycle = useCallback((cycle: Sample[] | null) => {
    if (!cycle) return;
    const r = cycleFeatures(cycle);
    if (!r) return;
    const verdict: Verdict = modelRef.current
      ? predict(modelRef.current, r.f)
      : { result: "check", unsure: true, p: 0, baselineSaysDone: false };
    setCycles((c) => [...c, { ...verdict, n: c.length + 1, rom: r.f.rom, curve: r.ext }]);
  }, []);

  // 3. Каждый новый кадр -> кисть -> угол -> рисуем
  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const lm = landmarkerRef.current;
    if (video && canvas && lm && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const W = video.videoWidth;
      const H = video.videoHeight;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);

      const res = lm.detectForVideo(video, performance.now());
      let sample: Sample = { t: video.currentTime, incl: null, vis: 0 };
      if (res.landmarks.length) {
        let k = 0; // если рук две — берём самую уверенную
        res.handedness.forEach((h, i) => {
          if (h[0].score > res.handedness[k][0].score) k = i;
        });
        const hand = res.landmarks[k];
        const sc = res.handedness[k][0].score;
        const draw = new DrawingUtils(ctx);
        draw.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: "rgba(255,255,255,0.6)", lineWidth: 2 });
        draw.drawConnectors(hand, [{ start: HAND.wrist, end: HAND.mcp9 }], { color: "#22c55e", lineWidth: 8 });
        const inc = inclination(hand[HAND.wrist], hand[HAND.mcp9], W, H);
        sample = { t: video.currentTime, incl: sc >= SCORE_OK ? inc : null, vis: sc };
        setIncl(inc);
        setScore(sc);
      } else {
        setScore(0);
      }
      samplesRef.current.push(sample);
      // камера: циклы выделяет детектор; видеофайл: всё видео = один цикл (как в датасете)
      if (sourceRef.current === "camera") finishCycle(detectorRef.current.push(sample));
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [finishCycle]);

  function stopCamera() {
    const video = videoRef.current;
    (video?.srcObject as MediaStream | null)?.getTracks().forEach((tr) => tr.stop());
    if (video) video.srcObject = null;
  }

  const reset = () => {
    samplesRef.current = [];
    detectorRef.current.reset();
    lastVideoTimeRef.current = -1;
    setCycles([]);
  };

  const begin = (src: Source) => {
    sourceRef.current = src;
    setSource(src);
    samplesRef.current = [];
    detectorRef.current.reset();
    lastVideoTimeRef.current = -1;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  };

  const startCamera = async () => {
    const video = videoRef.current!;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.removeAttribute("src");
      video.srcObject = stream;
      await video.play();
      setStatus(modelRef.current ? "ready" : "noModel");
      begin("camera");
    } catch {
      setStatus("cameraDenied");
    }
  };

  const playUrl = async (url: string) => {
    const video = videoRef.current!;
    stopCamera();
    video.src = url;
    begin("file");
    try {
      await video.play();
      setStatus(modelRef.current ? "ready" : "noModel");
    } catch {
      setStatus("badVideo");
    }
  };

  const onEnded = () => {
    if (sourceRef.current === "file") finishCycle(samplesRef.current);
  };

  const finishSession = () => {
    if (sourceRef.current === "camera") finishCycle(detectorRef.current.flush());
    stopCamera();
    cancelAnimationFrame(rafRef.current);
    sourceRef.current = "none";
    setSource("none");
    pendingSaveRef.current = true;
    setSaveTick((x) => x + 1);
  };

  const statusText: Record<Status, string> = {
    loading: t.loading,
    ready: t.statusReady,
    noModel: t.statusNoModel,
    cameraDenied: t.cameraDenied,
    badVideo: t.hevc,
    error: t.statusNoModel,
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl p-4 text-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <Link href="/" className="text-lg text-slate-500 underline">
            ← {t.home}
          </Link>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <h1 className="mb-1 text-3xl font-bold">{t.exercise}</h1>
        <p className="mb-4 text-lg text-slate-600">{statusText[status]}</p>

        <div className="mb-3 flex flex-wrap gap-3">
          <button onClick={startCamera} className="rounded-2xl bg-blue-600 px-6 py-4 text-xl font-semibold text-white">
            {t.camera}
          </button>
          <label className="cursor-pointer rounded-2xl border-2 border-blue-600 px-6 py-4 text-xl font-semibold text-blue-700">
            {t.upload}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && playUrl(URL.createObjectURL(e.target.files[0]))}
            />
          </label>
          {(source !== "none" || cycles.length > 0) && (
            <button onClick={finishSession} className="rounded-2xl bg-slate-800 px-6 py-4 text-xl font-semibold text-white">
              {t.finish}
            </button>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-base">
          <span className="self-center text-slate-500">{t.tryDemo}:</span>
          <button onClick={() => playUrl("/demo/complete_test_08.mp4")} className="rounded-xl bg-slate-100 px-3 py-2">
            {t.demoFull}
          </button>
          <button onClick={() => playUrl("/demo/incomplete_test_08.mp4")} className="rounded-xl bg-slate-100 px-3 py-2">
            {t.demoPartial}
          </button>
        </div>

        <div className={`relative overflow-hidden rounded-2xl bg-black ${source === "camera" ? "scale-x-[-1]" : ""}`}>
          <video ref={videoRef} playsInline muted className="block w-full" onEnded={onEnded} />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-slate-100 p-3">
            <div className="text-sm text-slate-500">{t.incl}</div>
            <div className="text-3xl font-bold">{incl === null ? "—" : `${Math.round(incl)}°`}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 p-3">
            <div className="text-sm text-slate-500">{t.handVisible}</div>
            <div className="text-3xl font-bold">{score >= SCORE_OK ? t.yes : t.no}</div>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-2xl font-bold">
            {t.cycles}: {cycles.length}
          </h2>
          <ul className="space-y-2">
            {cycles.map((c) => (
              <li
                key={c.n}
                className={`rounded-2xl p-4 text-xl ${c.result === "done" ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-800"}`}
              >
                <b>
                  {t.cycle} {c.n}:
                </b>{" "}
                {c.result === "done" ? t.done : t.check}
                {c.reason === "fast" && <span className="block text-base text-slate-600">{t.reasonFast}</span>}
                {c.reason === "tracking" && <span className="block text-base text-slate-600">{t.reasonTracking}</span>}
                {c.unsure && <span className="block text-base text-slate-500">{t.unsure}</span>}
                {c.result === "check" && (
                  <Link href="/instruction" className="mt-1 block text-base text-blue-700 underline">
                    {t.watchInstr}
                  </Link>
                )}
                <span className="block text-sm text-slate-400">
                  {t.confidence} {Math.round((c.result === "done" ? c.p : 1 - c.p) * 100)}% · {t.amplitude}{" "}
                  {Math.round(c.rom)}°
                </span>
              </li>
            ))}
          </ul>
          {cycles.length > 0 && (
            <button onClick={reset} className="mt-3 text-lg text-slate-500 underline">
              {t.reset}
            </button>
          )}
        </section>

        <SessionSummary cycles={cycles} t={t} historyVersion={historyVersion} />
      </div>
    </main>
  );
}
