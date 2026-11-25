# SerIQ — ИИ-помощник домашней реабилитации

Кейс SerIQ, AI-Sana Shakarim Solveathon: AI & Medicine 2026.

По видео с камеры или по загруженной записи SerIQ оценивает цикл упражнения **E02 «разгибание локтя»** и показывает нейтральный результат: **«Выполнено»** или **«Проверьте инструкцию»**. В конце занятия формируется сводка: число циклов, их классы и график «коридор движения».

**Демо:** https://seriq-seven.vercel.app
**Отчёт с метриками:** [REPORT.md](REPORT.md)
**ИИ-сервисы, данные и лицензии:** [TOOLS.md](TOOLS.md)

## Как это работает

1. Камера или видео → **MediaPipe HandLandmarker** (в браузере) находит 21 точку кисти.
2. Ось кулака (запястье → костяшка среднего пальца) ≈ ось предплечья → угол наклона к столу. Локоть не нужен: на train-видео датасета снято крупно только предплечье, и модель позы не находит там локоть (проверено, 32% кадров).
3. Ряд угла приводится к 15 точкам в секунду, выбросы детектора отбрасываются, ряд сглаживается.
4. Детектор выделяет циклы из непрерывного видео камеры (загруженное видео = один цикл, как в датасете).
5. 5 признаков цикла → **наша логистическая регрессия** → вероятность → нейтральный ответ. При низкой уверенности — предложение посмотреть инструкцию, без медицинских советов.

**Приватность:** видео не покидает устройство, сервера нет. История занятий хранится только в браузере (localStorage), кнопка «Удалить мои данные».

## Структура

```
ml/    extract_landmarks.py  — точки кисти/позы из видео (MediaPipe, Python)
       features.py           — признаки цикла (копия логики web/lib/features.ts)
       train.py              — baseline vs модель, LOSO + test, стресс-тест, REPORT.md, model.json
       out/                  — landmarks.csv, features.csv, матрицы ошибок
web/   Next.js: app/ (экраны), lib/ (углы, признаки, циклы, классификатор), public/ (модели, model.json, демо-видео)
REPORT.md                    — метрики
```

## Запуск сайта

Нужен Node.js 20+.

```bash
cd web
npm install
npm run dev
```

Открыть http://localhost:3000. Камера работает на `localhost` или по HTTPS.

## Воспроизвести обучение

Нужен Python 3.10–3.12.

```bash
cd ml
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install mediapipe opencv-python numpy pandas scipy scikit-learn matplotlib
```

Только переобучить (точки уже в `ml/out/landmarks.csv`, видео не нужны):

```bash
python features.py
python train.py
```

С нуля, из видео: скачать [датасет](https://solveathon.shakarim.edu.kz/static/cases/seriq-dataset.zip) и модель кисти:

```bash
curl -L -o hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
python extract_landmarks.py --data путь/к/seriq-dataset --no-pose
python features.py
python train.py
```

## Данные и разбиение

Только папка `2_Extending the Elbow`: 127 видео. Train — добровольцы 01–05 (107 видео), test — доброволец 08 (20 видео).
Validation — Leave-One-Subject-Out по ID добровольца: видео одного человека никогда не попадают одновременно в обучение и проверку.
Метка берётся из папки (Complete/Incomplete): у 10 файлов `04_02_00_*` в папке Complete метка в имени ошибочная.

## Ограничения

Прототип не является медицинским изделием, не ставит диагнозов и не даёт медицинских рекомендаций. В test один человек, в датасете — добровольцы, а не пациенты; нужен пилот с автором кейса.
