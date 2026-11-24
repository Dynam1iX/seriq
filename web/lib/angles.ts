/**
 * Углы руки. ВАЖНО: формула 1-в-1 совпадает с ml/features.py (inclination) — менять только вместе.
 * Координаты MediaPipe нормированы (0..1), поэтому умножаем на ширину/высоту кадра.
 */
type P = { x: number; y: number };

// Индексы точек HandLandmarker
export const HAND = { wrist: 0, mcp5: 5, mcp9: 9, mcp17: 17 } as const;

const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Наклон отрезка a -> b к горизонтали: 90° = вертикально вверх, 0° = лежит на столе.
 * Не зависит от того, в какую сторону смотрит рука (и от зеркала камеры).
 * Для кисти: a = запястье, b = костяшка среднего пальца (ось кулака ≈ ось предплечья).
 */
export function inclination(a: P, b: P, W: number, H: number): number {
  const dx = (b.x - a.x) * W;
  const dy = (a.y - b.y) * H; // ось y в картинке идёт вниз
  return deg(Math.atan2(dy, Math.abs(dx)));
}
