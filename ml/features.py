"""
SerIQ, шаг 2: признаки одного цикла из точек.
ВАЖНО: формулы совпадают с web/lib/features.ts — менять только вместе.

    python features.py            # out/landmarks.csv + out/index.csv -> out/features.csv, out/curves.npz
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.ndimage import median_filter

VIS_OK = 0.5
ARMS = {"l": ("l_elbow", "l_wrist"), "r": ("r_elbow", "r_wrist")}
# Признаки модели — только про движение. duration / vis_mean / valid_frac зависят от камеры и длины ролика
# (а камеры в train и test разные), поэтому они пишутся в CSV, но в модель НЕ идут — только для «уверенности».
FEATURES = ["rom", "low", "t_peak", "v_peak", "v_mean", "hold", "frac45", "reversals"]
QUALITY = ["duration", "vis_mean", "valid_frac"]
CURVE_POINTS = 64


def inclination(ex, ey, wx, wy, W, H):
    """Наклон предплечья к горизонтали, градусы: 90 = вверх, 0 = на столе (как в angles.ts)."""
    dx = (wx - ex) * W
    dy = (ey - wy) * H
    return np.degrees(np.arctan2(dy, np.abs(dx)))


def hand_inclination(g: pd.DataFrame):
    """Наклон оси кулака: запястье -> костяшка среднего пальца (точки 0 -> 9 HandLandmarker)."""
    return inclination(g["h_wrist_x"], g["h_wrist_y"], g["h_mcp9_x"], g["h_mcp9_y"], g["width"], g["height"])


HAND_MIN_SHARE = 0.6  # если кулак найден хотя бы в 60% кадров — берём кисть, иначе позу


def angle_series(g: pd.DataFrame):
    """Ряд наклона по одному видео. Источник: кисть (если найдена), иначе поза. Возвращает (t, inc, vis, ok, source)."""
    t = g["t"].to_numpy(dtype=float)
    if "hand_score" in g and (g["hand_score"].fillna(0) >= VIS_OK).mean() >= HAND_MIN_SHARE:
        vis = g["hand_score"].fillna(0).to_numpy()
        inc = hand_inclination(g).to_numpy(dtype=float)
        ok = (vis >= VIS_OK) & np.isfinite(inc)
        return t, inc, vis, ok, "hand"
    best, best_score = None, -1
    for arm, (e, w) in ARMS.items():
        if f"{e}_vis" not in g:
            continue
        score = np.nanmean(np.minimum(g[f"{e}_vis"].fillna(0), g[f"{w}_vis"].fillna(0)))
        if score > best_score:
            best, best_score = arm, score
    e, w = ARMS[best]
    vis = np.minimum(g[f"{e}_vis"].fillna(0), g[f"{w}_vis"].fillna(0)).to_numpy()
    inc = inclination(g[f"{e}_x"], g[f"{e}_y"], g[f"{w}_x"], g[f"{w}_y"], g["width"], g["height"]).to_numpy(dtype=float)
    ok = (vis >= VIS_OK) & np.isfinite(inc)
    return t, inc, vis, ok, "pose"


OUTLIER_DEG = 30   # кадр-выброс: отличается от медианы соседей (окно 9) больше чем на 30°


def _median_nearest(a, size):
    return median_filter(a, size=size, mode="nearest")  # края: повтор крайнего значения (так же в JS)


def cycle_features(t, inc, vis, ok):
    """Признаки по ряду наклона. t в секундах. Возвращает (dict признаков, кривая ext)."""
    valid_frac = float(ok.mean()) if len(ok) else 0.0
    if ok.sum() < 5:
        return None, None
    t, inc, vis = t[ok], inc[ok], vis[ok]
    # 1) выбросы: детектор кисти иногда на 2-3 кадра путает запястье и костяшки
    keep = np.abs(inc - _median_nearest(inc, 9)) <= OUTLIER_DEG
    if keep.sum() < 5:
        return None, None
    t, inc, vis = t[keep], inc[keep], vis[keep]
    # 2) сглаживание
    inc = _median_nearest(inc, 5)
    # 3) устойчивые верх и низ движения (люди иногда сначала поднимают руку, потом опускают)
    top = float(np.percentile(inc, 95))
    low = float(np.percentile(inc, 5))
    ext = np.clip(top - inc, 0, None)                 # насколько предплечье ниже своей верхней точки, градусы
    rom = top - low
    i_peak = int(ext.argmax())
    dt = np.diff(t)
    v = np.diff(ext) / np.where(dt > 0, dt, np.nan)   # градусы в секунду (по времени, а не по кадрам)
    v = v[np.isfinite(v)]
    fast = v[np.abs(v) > 15]
    reversals = int(np.sum(np.diff(np.sign(fast)) != 0)) if len(fast) > 1 else 0
    seg_dt = np.append(dt, dt[-1] if len(dt) else 0)
    f = dict(
        rom=rom,
        low=low,
        t_peak=float(t[i_peak] - t[0]),
        duration=float(t[-1] - t[0]),
        v_peak=float(np.abs(v).max()) if len(v) else 0.0,
        v_mean=float(np.abs(v).mean()) if len(v) else 0.0,
        hold=float(seg_dt[ext >= rom - 10].sum()),
        frac45=float((ext > 45).mean()),
        reversals=reversals,
        vis_mean=float(vis.mean()),
        valid_frac=valid_frac,
    )
    # кривая для «коридора движения»: ext на 64 точках нормированного времени
    tn = (t - t[0]) / max(t[-1] - t[0], 1e-6)
    curve = np.interp(np.linspace(0, 1, CURVE_POINTS), tn, ext)
    return f, curve


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--landmarks", default=None)
    args = ap.parse_args()
    out = Path(args.out)
    lm = pd.read_csv(args.landmarks or out / "landmarks.csv")
    index = pd.read_csv(out / "index.csv", dtype={"volunteer": str})
    rows, curves, ids = [], [], []
    for vid, g in lm.groupby("video_id", sort=False):
        g = g.sort_values("t")
        t, inc, vis, ok, source = angle_series(g)
        f, curve = cycle_features(t, inc, vis, ok)
        if f is None:
            print(f"  ! мало видимых кадров, пропускаю: {vid}")
            continue
        rows.append(dict(video_id=vid, source=source, **f))
        curves.append(curve)
        ids.append(vid)
    feats = pd.DataFrame(rows).merge(index[["video_id", "volunteer", "label", "split"]], on="video_id")
    feats.to_csv(out / "features.csv", index=False)
    np.savez(out / "curves.npz", ids=np.array(ids), curves=np.array(curves))
    print(f"Признаки: {len(feats)} видео -> {out / 'features.csv'}")
    print("Источник угла по видео:", feats.groupby(["split", "source"]).size().to_dict())
    print(feats.groupby(["split", "label"])[["rom", "t_peak", "hold", "v_peak"]].mean().round(1))


if __name__ == "__main__":
    main()
