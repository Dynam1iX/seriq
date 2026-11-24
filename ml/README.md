# SerIQ — ML (Python)

## Установка (Windows, PowerShell), Python 3.10–3.12

```powershell
cd ml
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install mediapipe opencv-python numpy pandas scipy scikit-learn matplotlib
curl.exe -L -o pose_landmarker_full.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task
```

Датасет: https://solveathon.shakarim.edu.kz/static/cases/seriq-dataset.zip (1,2 ГБ) — распаковать, например, в `D:\seriq-dataset`.
Видео в Git НЕ кладём (добавить `seriq-dataset/` и `*.mp4` в `.gitignore`).

## Шаг 1. Проверка (≈3 мин)

```powershell
python extract_landmarks.py --data "D:\seriq-dataset" --check
```

Смотрим вердикт в конце и картинки `out\debug\*.jpg`:
зелёные точки = модель уверена, красные = нет.

## Шаг 2. Все 127 видео (≈15–25 мин)

```powershell
python extract_landmarks.py --data "D:\seriq-dataset"
```

Результат: `out\index.csv`, `out\landmarks.csv`.

## Шаг 3. Признаки и обучение (≈1 мин)

```powershell
python features.py
python train.py
```

Результат:
- `..\REPORT.md` — отчёт с метриками для жюри (balanced accuracy, F1, матрица ошибок; baseline и модель; LOSO и test)
- `out\cm_*.png` — картинки матриц ошибок для слайда 6
- `..\web\public\model.json` — модель для браузера
- `..\web\public\corridor.json` — «коридор движения» (вау-фича)

Структура репозитория:
```
seriq/
  ml/    extract_landmarks.py, features.py, train.py, out/
  web/   Next.js (app/train/page.tsx, lib/*.ts, public/model.json)
  REPORT.md
```
