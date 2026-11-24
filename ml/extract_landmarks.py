"""
SerIQ, шаг 1: ключевые точки руки из видео E02 (Extending the Elbow).

Быстрая проверка (2 видео на человека, ~3 мин) — ДЕЛАТЬ ПЕРВОЙ:
    python extract_landmarks.py --data "D:/seriq-dataset" --check

Все 127 видео (~15-25 мин на ноутбуке):
    python extract_landmarks.py --data "D:/seriq-dataset"

--data может указывать на любую папку выше "2_Extending the Elbow" — скрипт найдёт её сам.
Модель: файл pose_landmarker_full.task рядом со скриптом (или --model путь).

Выход:
    out/index.csv      — одна строка на видео: путь, доброволец, метка (ИЗ ПАПКИ), split
    out/landmarks.csv  — одна строка на кадр: время, точки плеча/локтя/запястья, visibility
    out/debug/*.jpg    — в режиме --check: кадр со скелетом для проверки глазами
"""
import argparse
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

EXERCISE_DIR = "2_Extending the Elbow"
NAME_RE = re.compile(r"^(\d{2})_(\d{2})_(\d{2})_(\d{2})$")  # VV_EE_L_RR
POINTS = {11: "l_shoulder", 12: "r_shoulder", 13: "l_elbow", 14: "r_elbow", 15: "l_wrist", 16: "r_wrist"}
# Кисть (HandLandmarker): запястье, костяшки указательного, среднего, мизинца.
# Ось «запястье -> костяшка среднего пальца» у кулака совпадает с осью предплечья — локоть не нужен.
HAND_POINTS = {0: "h_wrist", 5: "h_mcp5", 9: "h_mcp9", 17: "h_mcp17"}
ARMS = {"l": ("l_shoulder", "l_elbow", "l_wrist"), "r": ("r_shoulder", "r_elbow", "r_wrist")}
VIS_OK = 0.5


# ---------- 1. Индекс видео ----------
def find_exercise_dir(root: Path) -> Path:
    if root.name == EXERCISE_DIR:
        return root
    hits = [p for p in root.rglob(EXERCISE_DIR) if p.is_dir()]
    if not hits:
        sys.exit(f"Не нашёл папку '{EXERCISE_DIR}' внутри {root}")
    return hits[0]


def build_index(data_root: str) -> pd.DataFrame:
    ex = find_exercise_dir(Path(data_root))
    rows = []
    for label_dir, label in (("Complete", 1), ("Incomplete", 0)):
        for split in ("Train", "Test"):
            for f in sorted((ex / label_dir / split).glob("*.mp4")):
                m = NAME_RE.match(f.stem)
                if not m:
                    print(f"  ! пропускаю файл с непонятным именем: {f.name}")
                    continue
                vol, _ex, name_label, rep = m.groups()
                rows.append(dict(
                    # ID = папка + имя: имена 04_02_00_01..10 повторяются в Complete и Incomplete!
                    video_id=f"{label_dir}/{split}/{f.stem}",
                    path=str(f),
                    volunteer=vol,
                    label=label,                      # метка из ПАПКИ, а не из имени
                    split=split.lower(),
                    rep=int(rep),
                    name_label_mismatch=int(name_label) != label,
                ))
    df = pd.DataFrame(rows)
    print(f"Нашёл {len(df)} видео E02 в {ex}")
    print(df.groupby(["split", "volunteer", "label"]).size().unstack(fill_value=0).rename(columns={0: "incomplete", 1: "complete"}))
    bad = df[df.name_label_mismatch]
    if len(bad):
        print(f"  ! {len(bad)} файлов: метка в имени не совпадает с папкой (берём папку): {', '.join(bad.video_id)}")
    return df


# ---------- 2. Точки по кадрам ----------
def make_landmarker(model_path: str):
    opts = vision.PoseLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.3,
        min_pose_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )
    return vision.PoseLandmarker.create_from_options(opts)


def make_hand_landmarker(model_path: str):
    opts = vision.HandLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.3,
        min_hand_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )
    return vision.HandLandmarker.create_from_options(opts)


def process_video(row, model_path, stride, max_side, debug_dir=None, hand_model_path=None):
    cap = cv2.VideoCapture(row.path)
    if not cap.isOpened():
        print(f"  ! не открылось: {row.path}")
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    landmarker = make_landmarker(model_path) if model_path else None  # новый на каждое видео: время должно расти
    hand_lm = make_hand_landmarker(hand_model_path) if hand_model_path else None
    out, i, last_ts = [], 0, -1
    debug_frame = n_total // 2 if n_total else 150
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        if i % stride:
            i += 1
            continue
        ts = int(round(t_ms)) if t_ms > 0 else int(round(i * 1000 / fps))
        ts = max(ts, last_ts + 1)
        last_ts = ts
        h, w = frame.shape[:2]
        k = max_side / max(h, w)
        if k < 1:
            frame = cv2.resize(frame, (int(w * k), int(h * k)), interpolation=cv2.INTER_AREA)
        h, w = frame.shape[:2]
        rec = dict(video_id=row.video_id, frame=i, t=ts / 1000.0, width=w, height=h, detected=False)
        res = None
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        rec["hand_score"] = 0.0
        if hand_lm is not None:
            hres = hand_lm.detect_for_video(img, ts)
            if hres.hand_landmarks:
                # если найдено две руки — берём самую уверенную
                scores = [h[0].score for h in hres.handedness]
                k = int(np.argmax(scores))
                rec["hand_score"] = float(scores[k])
                for idx, name in HAND_POINTS.items():
                    p = hres.hand_landmarks[k][idx]
                    rec[f"{name}_x"], rec[f"{name}_y"] = p.x, p.y
        if landmarker is not None:
            res = landmarker.detect_for_video(img, ts)
            if res.pose_landmarks:
                rec["detected"] = True
                lms = res.pose_landmarks[0]
                for idx, name in POINTS.items():
                    p = lms[idx]
                    rec[f"{name}_x"], rec[f"{name}_y"], rec[f"{name}_vis"] = p.x, p.y, p.visibility
        out.append(rec)
        if debug_dir is not None and abs(i - debug_frame) < stride:
            save_debug(frame, rec, debug_dir / f"{row.video_id.replace('/', '_')}.jpg")
        i += 1
    cap.release()
    if landmarker is not None:
        landmarker.close()
    if hand_lm is not None:
        hand_lm.close()
    return out


def save_debug(frame, rec, path):
    img = frame.copy()
    h, w = img.shape[:2]
    for arm, (s, e, wr) in ARMS.items():
        pts = []
        for name in (s, e, wr):
            x, y, v = rec.get(f"{name}_x"), rec.get(f"{name}_y"), rec.get(f"{name}_vis", 0)
            if x is None or np.isnan(x):
                pts.append(None)
                continue
            p = (int(x * w), int(y * h))
            color = (0, 200, 0) if v >= VIS_OK else (0, 0, 255)  # зелёный = видно, красный = модель не уверена
            cv2.circle(img, p, 8, color, -1)
            cv2.putText(img, f"{name} {v:.2f}", (p[0] + 10, p[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            pts.append(p)
        for a, b in ((0, 1), (1, 2)):
            if pts[a] and pts[b]:
                cv2.line(img, pts[a], pts[b], (255, 200, 0), 3)
    if rec.get("hand_score", 0) > 0 and rec.get("h_wrist_x") is not None:
        a = (int(rec["h_wrist_x"] * w), int(rec["h_wrist_y"] * h))
        b = (int(rec["h_mcp9_x"] * w), int(rec["h_mcp9_y"] * h))
        cv2.arrowedLine(img, a, b, (255, 0, 255), 4, tipLength=0.3)  # фиолетовая стрелка = ось кулака
        cv2.putText(img, f"hand {rec['hand_score']:.2f}", (a[0] + 10, a[1] + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 255), 2)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), img)


# ---------- 3. Отчёт о качестве: GO / план B ----------
def quality_report(lm: pd.DataFrame, index: pd.DataFrame):
    if not lm["detected"].any():
        hand = (lm["hand_score"] >= VIS_OK).groupby(lm["video_id"]).mean().mean() if "hand_score" in lm else 0
        print(f"\nPose не запускалась. Кулак найден в среднем в {hand:.0%} кадров.")
        return
    per_video = []
    for vid, g in lm.groupby("video_id"):
        best = None
        for arm, (s, e, w) in ARMS.items():
            ok_ew = ((g[f"{e}_vis"] >= VIS_OK) & (g[f"{w}_vis"] >= VIS_OK)).mean()
            ok_sh = (g[f"{s}_vis"] >= VIS_OK).mean()
            if best is None or ok_ew > best[1]:
                best = (arm, ok_ew, ok_sh)
        per_video.append(dict(video_id=vid, arm=best[0], elbow_wrist_ok=best[1], shoulder_ok=best[2],
                              detected=g["detected"].mean(),
                              hand_ok=(g.get("hand_score", pd.Series(0, index=g.index)) >= VIS_OK).mean()))
    q = pd.DataFrame(per_video).merge(index[["video_id", "volunteer", "split"]], on="video_id")
    summary = q.groupby(["split", "volunteer"])[["detected", "elbow_wrist_ok", "shoulder_ok", "hand_ok"]].mean().round(2)
    print("\nДоля кадров (0..1), где точки видны с visibility >= 0.5:")
    print(summary)
    train_ok = q[q.split == "train"]["elbow_wrist_ok"].mean()
    test_ok = q[q.split == "test"]["elbow_wrist_ok"].mean()
    hand_tr = q[q.split == "train"]["hand_ok"].mean()
    hand_te = q[q.split == "test"]["hand_ok"].mean()
    print(f"\nPose (локоть+запястье): train {train_ok:.0%}, test {test_ok:.0%}")
    print(f"Hand (кулак найден):      train {hand_tr:.0%}, test {hand_te:.0%}")
    if hand_tr >= 0.6 and hand_te >= 0.6:
        print("ВЕРДИКТ: HAND — ось кулака работает и в train, и в test. Идём дальше: полное извлечение.")
    elif hand_tr >= 0.6:
        print("ВЕРДИКТ: HAND для train + POSE для test (features.py выберет источник по видео).")
    else:
        print("ВЕРДИКТ: кулак находится плохо — пришли вывод и картинки out/debug.")
    return q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="папка датасета (любой уровень выше '2_Extending the Elbow')")
    ap.add_argument("--model", default=str(Path(__file__).with_name("pose_landmarker_full.task")))
    ap.add_argument("--hand-model", default=str(Path(__file__).with_name("hand_landmarker.task")))
    ap.add_argument("--out", default="out")
    ap.add_argument("--check", action="store_true", help="быстрая проверка: 2 видео на человека + debug-картинки")
    ap.add_argument("--stride", type=int, default=2, help="брать каждый N-й кадр (2 = ~15 кадров/с)")
    ap.add_argument("--max-side", type=int, default=960, help="уменьшать кадр до этой стороны (ускоряет)")
    ap.add_argument("--dry-run", action="store_true", help="только прочитать видео, без модели")
    ap.add_argument("--no-pose", action="store_true", help="не запускать pose-модель (только кисть) — вдвое быстрее")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(exist_ok=True)
    index = build_index(args.data)
    index.to_csv(out / "index.csv", index=False)

    model = None if (args.dry_run or args.no_pose) else args.model
    if model and not Path(model).exists():
        sys.exit(f"Нет файла модели {model}. Скачай pose_landmarker_full.task (см. README).")
    hand_model = None if args.dry_run else args.hand_model
    if hand_model and not Path(hand_model).exists():
        sys.exit(f"Нет файла {hand_model}. Скачай hand_landmarker.task (см. README).")

    todo = index
    if args.check:
        todo = index.groupby(["volunteer", "label"], group_keys=False).head(1)  # ~12 видео: каждый человек x класс
    debug_dir = out / "debug" if args.check else None

    rows, t0 = [], time.time()
    for k, row in enumerate(todo.itertuples(), 1):
        frames = process_video(row, model, args.stride, args.max_side, debug_dir, hand_model)
        rows.extend(frames)
        det = np.mean([f["detected"] for f in frames]) if frames else 0
        hnd = np.mean([f["hand_score"] >= VIS_OK for f in frames]) if frames else 0
        print(f"[{k}/{len(todo)}] {row.video_id}: {len(frames)} кадров, поза {det:.0%}, кулак {hnd:.0%}  ({time.time() - t0:.0f} c)")

    lm = pd.DataFrame(rows)
    name = "landmarks_check.csv" if args.check else "landmarks.csv"
    lm.to_csv(out / name, index=False)
    print(f"\nСохранил {out / name}: {len(lm)} строк")
    if not args.dry_run:
        q = quality_report(lm, index)
        if q is not None:
            q.to_csv(out / "quality.csv", index=False)


if __name__ == "__main__":
    main()
