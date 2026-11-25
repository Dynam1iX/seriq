# ИИ-сервисы, данные и лицензии

## ИИ-сервисы, которые мы использовали при разработке

| Сервис | Для чего |
|---|---|
| Claude (Anthropic) | Разбор ТЗ и данных, план работы, помощь в написании кода (Python и TypeScript), отладка, тексты интерфейса KK/RU. Весь код запускали, проверяли и тестировали сами. |

> Если вы пользовались и другими ИИ-сервисами (ChatGPT, Copilot, генерация картинок для слайдов и т. п.) — допишите их сюда.

## ИИ-модели внутри продукта

| Модель | Где | Лицензия |
|---|---|---|
| MediaPipe Hand Landmarker (`hand_landmarker.task`) | браузер (`@mediapipe/tasks-vision`) и Python (`mediapipe`) | Apache 2.0 |
| MediaPipe Pose Landmarker (`pose_landmarker_full.task`) | только для проверки на этапе анализа данных | Apache 2.0 |
| Наша модель: логистическая регрессия (scikit-learn) | обучена нами на датасете кейса, работает в браузере (`web/public/model.json`) | код проекта |

## Данные

| Данные | Источник | Как используем |
|---|---|---|
| An upper limb stroke rehabilitation exercise video dataset | [Mendeley Data, DOI 10.17632/49h9dcwx5v.1](https://data.mendeley.com/datasets/49h9dcwx5v/1); выдан организаторами как датасет кейса | Обучение и проверка (только упражнение E02). 4 коротких видео перекодированы в H.264 и лежат в `web/public/demo` для демонстрации, с указанием источника на экране |

Персональные данные пользователей не собираются: видео обрабатывается на устройстве и никуда не отправляется.

## Библиотеки

Next.js, React, Tailwind CSS (MIT) · scikit-learn, NumPy, pandas, SciPy, Matplotlib (BSD) · OpenCV (Apache 2.0) · MediaPipe (Apache 2.0).
