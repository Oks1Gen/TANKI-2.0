// ===== Пользовательские настройки (управление, звук, графика) =====
// Хранятся отдельно от сетапа боя: steel-assault-settings-v1

export type Quality = 'auto' | 'low' | 'high';

export interface Settings {
  /** множитель чувствительности мыши 0.3..3 */
  sensitivity: number;
  invertY: boolean;
  /** громкость мастера 0..1 */
  volume: number;
  /** базовый FOV камеры 55..75 */
  fov: number;
  quality: Quality;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  volume: 0.7,
  fov: 62,
  quality: 'auto',
};

const KEY = 'steel-assault-settings-v1';

const clampNum = (v: unknown, fb: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.max(min, Math.min(max, n));
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const j = JSON.parse(raw) as Partial<Settings>;
    return {
      sensitivity: clampNum(j.sensitivity, 1, 0.3, 3),
      invertY: j.invertY === true,
      volume: clampNum(j.volume, 0.7, 0, 1),
      fov: clampNum(Math.round(j.fov as number), 62, 55, 75),
      quality: j.quality === 'low' || j.quality === 'high' ? j.quality : 'auto',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota/private mode — настройки остаются только в памяти */
  }
}

export const QUALITY_NAMES: Record<Quality, string> = {
  auto: 'Авто',
  low: 'Низкое',
  high: 'Высокое',
};
