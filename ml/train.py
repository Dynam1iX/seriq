"""
SerIQ, шаг 3: baseline vs наша модель, честная оценка по людям, отчёт и экспорт в JS.

    python train.py      # out/features.csv -> REPORT.md, out/*.png, ../web/public/model.json, ../web/public/corridor.json

Оценка:
  * validation = Leave-One-Subject-Out на train-добровольцах (01-05): учимся на 4, проверяем на 5-м;
  * test = доброволец 08 (папки Test), считается ОДИН раз в конце.
Метрики по ТЗ: balanced accuracy, F1, матрица ошибок.
"""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import FEATURES, CURVE_POINTS

P_DONE = 0.7      # p(complete) >= 0.7 -> «Выполнено»
P_UNSURE = 0.3    # 0.3..0.7 -> «Результат неточный, посмотрите инструкцию»


class RomThreshold(BaseEstimator, ClassifierMixin):
    """Baseline: complete, если амплитуда ROM больше порога. Порог подбирается на train-фолде."""
    def fit(self, X, y):
        rom = X[:, FEATURES.index("rom")]
        u = np.unique(rom)
        cands = (u[:-1] + u[1:]) / 2 if len(u) > 1 else u      # пороги — середины между соседними значениями
        scores = np.array([balanced_accuracy_score(y, (rom > c).astype(int)) for c in cands])
        best = np.flatnonzero(scores == scores.max())
        self.threshold_ = float(np.median(cands[best]))            # из равных по качеству — середина «зазора»
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        p = (X[:, FEATURES.index("rom")] > self.threshold_).astype(float)
        return np.c_[1 - p, p]

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


def models():
    return {
        "Majority (всегда частый класс)": DummyClassifier(strategy="most_frequent"),
        "Baseline: порог по амплитуде": RomThreshold(),
        "Логистическая регрессия": make_pipeline(StandardScaler(), LogisticRegression(C=1.0, class_weight="balanced", max_iter=1000)),
        "Случайный лес": RandomForestClassifier(n_estimators=300, max_depth=4, min_samples_leaf=3, class_weight="balanced", random_state=0),
    }


def metrics(y, p):
    pred = (p >= 0.5).astype(int)
    return dict(
        ba=balanced_accuracy_score(y, pred),
        f1=f1_score(y, pred, pos_label=1, zero_division=0),
        f1_macro=f1_score(y, pred, average="macro", zero_division=0),
        cm=confusion_matrix(y, pred, labels=[0, 1]),
    )


def plot_cm(cm, title, path):
    fig, ax = plt.subplots(figsize=(3.6, 3.2))
    ax.imshow(cm, cmap="Blues")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, int(cm[i, j]), ha="center", va="center", fontsize=16,
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
    ax.set_xticks([0, 1], ["incomplete", "complete"])
    ax.set_yticks([0, 1], ["incomplete", "complete"])
    ax.set_xlabel("Предсказание")
    ax.set_ylabel("Правда")
    ax.set_title(title, fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def cm_md(cm):
    return (f"| | предск. incomplete | предск. complete |\n|---|---|---|\n"
            f"| **правда incomplete** | {cm[0,0]} | {cm[0,1]} |\n| **правда complete** | {cm[1,0]} | {cm[1,1]} |")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--web", default="../web/public")
    ap.add_argument("--report", default="../REPORT.md")
    args = ap.parse_args()
    out, web = Path(args.out), Path(args.web)
    web.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(out / "features.csv", dtype={"volunteer": str})
    tr, te = df[df.split == "train"], df[df.split == "test"]
    Xtr, ytr, gtr = tr[FEATURES].to_numpy(), tr.label.to_numpy(), tr.volunteer.to_numpy()
    Xte, yte = te[FEATURES].to_numpy(), te.label.to_numpy()
    print(f"train: {len(tr)} видео, люди {sorted(set(gtr))};  test: {len(te)} видео, люди {sorted(set(te.volunteer))}")

    # --- 1. LOSO на train ---
    rows, loso_probs = [], {}
    for name, model in models().items():
        p_all = np.zeros(len(ytr))
        fold_ba = []
        for fit_idx, val_idx in LeaveOneGroupOut().split(Xtr, ytr, gtr):
            m = models()[name].fit(Xtr[fit_idx], ytr[fit_idx])
            p_all[val_idx] = m.predict_proba(Xtr[val_idx])[:, 1]
            fold_ba.append(balanced_accuracy_score(ytr[val_idx], (p_all[val_idx] >= 0.5).astype(int)))
        r = metrics(ytr, p_all)
        loso_probs[name] = p_all
        rows.append(dict(model=name, loso_ba=r["ba"], loso_ba_std=np.std(fold_ba), loso_f1=r["f1"], loso_cm=r["cm"]))
    loso = pd.DataFrame(rows)

    # выбор модели — ТОЛЬКО по LOSO (test не подглядываем)
    ours = loso[loso.model.isin(["Логистическая регрессия", "Случайный лес"])].sort_values("loso_ba", ascending=False)
    best_name = ours.iloc[0].model
    print(loso[["model", "loso_ba", "loso_ba_std", "loso_f1"]].round(3).to_string(index=False))
    print(f"Выбрана модель: {best_name}")

    # --- 2. Финальное обучение на всём train и ОДИН прогон на test (08) ---
    test_rows, fitted = [], {}
    for name in models():
        m = models()[name].fit(Xtr, ytr)
        fitted[name] = m
        r = metrics(yte, m.predict_proba(Xte)[:, 1])
        test_rows.append(dict(model=name, test_ba=r["ba"], test_f1=r["f1"], test_f1_macro=r["f1_macro"], test_cm=r["cm"]))
    test = pd.DataFrame(test_rows)
    res = loso.merge(test, on="model")

    base_name = "Baseline: порог по амплитуде"
    for name, tag in ((best_name, "model"), (base_name, "baseline")):
        row = res[res.model == name].iloc[0]
        plot_cm(row.test_cm, f"{name}\nTest (доброволец 08)", out / f"cm_test_{tag}.png")
        plot_cm(row.loso_cm, f"{name}\nLOSO (01-05)", out / f"cm_loso_{tag}.png")

    # доля «неуверенных» ответов на LOSO для выбранной модели
    p = loso_probs[best_name]
    unsure = float(((p > P_UNSURE) & (p < P_DONE)).mean())

    # --- 3. Экспорт в JS ---
    best = fitted[best_name]
    model_json = dict(features=FEATURES, p_done=P_DONE, p_unsure=P_UNSURE,
                      baseline_rom_threshold=fitted[base_name].threshold_, kind=None)
    if best_name == "Логистическая регрессия":
        sc, lr = best.named_steps["standardscaler"], best.named_steps["logisticregression"]
        model_json.update(kind="logreg", mean=sc.mean_.tolist(), scale=sc.scale_.tolist(),
                          coef=lr.coef_[0].tolist(), intercept=float(lr.intercept_[0]))
    else:
        # лес в JS переносим через m2cgen:  pip install m2cgen  ->  m2c.export_to_javascript(best)
        try:
            import m2cgen as m2c
            (web.parent / "lib" / "forest.js").write_text(m2c.export_to_javascript(best, function_name="forest"), encoding="utf-8")
            model_json.update(kind="forest_m2cgen")
        except ImportError:
            print("! Лучше лес, но m2cgen не установлен: pip install m2cgen — или используй логрегрессию.")
    (web / "model.json").write_text(json.dumps(model_json, ensure_ascii=False, indent=1), encoding="utf-8")

    cz = np.load(out / "curves.npz")
    cmap = dict(zip(cz["ids"], cz["curves"]))
    comp = np.array([cmap[v] for v in tr[tr.label == 1].video_id if v in cmap])
    corridor = dict(points=CURVE_POINTS, p10=np.percentile(comp, 10, axis=0).round(1).tolist(),
                    p50=np.percentile(comp, 50, axis=0).round(1).tolist(),
                    p90=np.percentile(comp, 90, axis=0).round(1).tolist())
    (web / "corridor.json").write_text(json.dumps(corridor), encoding="utf-8")

    # --- 4. REPORT.md ---
    fmt = lambda x: f"{x:.2f}"
    lines = [
        "# SerIQ — отчёт с метриками",
        "",
        "Задача: классификация цикла упражнения E02 (разгибание локтя) как complete / incomplete.",
        "Данные: [An upper limb stroke rehabilitation exercise video dataset](https://data.mendeley.com/datasets/49h9dcwx5v/1), папка `2_Extending the Elbow`.",
        f"Train: {len(tr)} видео, добровольцы {', '.join(sorted(set(gtr)))}. Test: {len(te)} видео, доброволец {', '.join(sorted(set(te.volunteer)))}.",
        "Метка берётся из папки (Complete/Incomplete). В `Complete/Train` 10 файлов `04_02_00_*` имеют «00» в имени — проверено по кадрам, это complete.",
        "",
        "## Как оценивали",
        "- Разбиение строго по ID добровольца: видео одного человека никогда не попадает и в обучение, и в проверку.",
        "- Validation: Leave-One-Subject-Out на 01–05 (5 фолдов). Модель выбирали только по этой оценке.",
        "- Test: доброволец 08 (другая камера и комната), посчитан один раз в конце.",
        f"- Признаки ({len(FEATURES)}): {', '.join(FEATURES)}. Конечное положение руки намеренно не используем.",
        "",
        "## Результаты",
        "",
        "| Модель | LOSO balanced acc. (± разброс по людям) | LOSO F1 | Test balanced acc. | Test F1 | Test macro-F1 |",
        "|---|---|---|---|---|---|",
    ]
    for r in res.itertuples():
        mark = " **(выбрана)**" if r.model == best_name else ""
        lines.append(f"| {r.model}{mark} | {fmt(r.loso_ba)} ± {fmt(r.loso_ba_std)} | {fmt(r.loso_f1)} | {fmt(r.test_ba)} | {fmt(r.test_f1)} | {fmt(r.test_f1_macro)} |")
    b, m = res[res.model == base_name].iloc[0], res[res.model == best_name].iloc[0]
    lines += [
        "",
        f"Порог baseline (на всём train): ROM > {fitted[base_name].threshold_:.1f}°.",
        "",
        f"### Матрица ошибок — {best_name}, test (08)",
        cm_md(m.test_cm), "",
        "![](ml/out/cm_test_model.png)", "",
        f"### Матрица ошибок — baseline, test (08)",
        cm_md(b.test_cm), "",
        "![](ml/out/cm_test_baseline.png)", "",
        "## Почему метрики почти 100% — и где это может сломаться",
        "Амплитуда движения (ROM) по классам, градусы:",
        "",
        "| Выборка | Класс | min | медиана | max |",
        "|---|---|---|---|---|",
    ] + [
        f"| {sp} | {'complete' if lb else 'incomplete'} | {g.rom.min():.0f} | {g.rom.median():.0f} | {g.rom.max():.0f} |"
        for (sp, lb), g in df.groupby(["split", "label"])
    ] + [
        "",
        f"Между классами зазор: неполные движения не больше {df[df.label == 0].rom.max():.0f}°, полные — не меньше {df[df.label == 1].rom.min():.0f}°. "
        "Поэтому на этом датасете задача почти линейно разделима, и даже простой порог работает. "
        "Наша модель добавляет оценку уверенности и учитывает скорость, удержание и плавность — это важно для живой камеры, "
        "где ракурс, свет и выделение циклов хуже, чем в аккуратно снятых роликах.",
        "",
        "Где может сломаться: другой ракурс камеры (сверху, а не сбоку), люди с компенсаторными движениями, "
        "очень медленные или дрожащие движения, неточное выделение циклов в непрерывном видео.",
        "",
        "## Уверенность",
        f"p(complete) ≥ {P_DONE} → «Выполнено». Иначе → «Проверьте инструкцию»; при {P_UNSURE} < p < {P_DONE} или плохой видимости руки — дополнительно «результат неточный, повторите».",
        f"На LOSO в «неуверенную» зону попало {unsure:.0%} циклов.",
        "",
        "## Ограничения (честно)",
        f"- В test один человек и {len(te)} видео: одна ошибка меняет balanced accuracy примерно на {100/len(te)*2:.0f} п.п.",
        "- Судя по описанию датасета, сняты добровольцы, а не пациенты; у пациентов возможны компенсаторные движения.",
        "- В датасете одно видео = один цикл; в приложении циклы выделяются автоматически из непрерывного видео.",
        "- Прототип не является медицинским изделием и не даёт медицинских рекомендаций.",
    ]
    Path(args.report).write_text("\n".join(lines), encoding="utf-8")
    print(f"\nГотово: {args.report}, {web / 'model.json'}, {web / 'corridor.json'}")
    print(res[["model", "loso_ba", "test_ba", "test_f1"]].round(3).to_string(index=False))


if __name__ == "__main__":
    main()
