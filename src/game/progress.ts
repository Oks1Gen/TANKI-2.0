import { TankId, UpgradeId, CamoId, TANKS, UPGRADES, CAMO_ORDER } from './config';

export interface TankProgress {
  unlocked: boolean;
  upgrades: Record<UpgradeId, number>;
  goldUpgrade: boolean;
  camos: CamoId[];
  camo: CamoId;
}

export interface Progress {
  xp: number;
  /** несгораемый суммарный опыт — по нему считаются звания */
  totalXp: number;
  gold: number;
  selectedTank: TankId;
  tanks: Record<TankId, TankProgress>;
  battles: number;
  wins: number;
  kills: number;
}

const KEY = 'steel-assault-progress-v1';

function emptyUpgrades(): Record<UpgradeId, number> {
  const r = {} as Record<UpgradeId, number>;
  UPGRADES.forEach((u) => (r[u.id] = 0));
  return r;
}

export function defaultProgress(): Progress {
  const tanks = {} as Record<TankId, TankProgress>;
  (Object.keys(TANKS) as TankId[]).forEach((id) => {
    tanks[id] = { unlocked: TANKS[id].unlockXp === 0, upgrades: emptyUpgrades(), goldUpgrade: false, camos: ['base'], camo: 'base' };
  });
  return { xp: 600, totalXp: 600, gold: 150, selectedTank: 't34', tanks, battles: 0, wins: 0, kills: 0 };
}

/** Безопасный deep-clone с фолбэком для старых браузеров без structuredClone */
export function cloneProgress<T>(v: T): T {
  try {
    if (typeof structuredClone === 'function') return structuredClone(v);
  } catch {
    /* fallthrough */
  }
  return JSON.parse(JSON.stringify(v)) as T;
}

const num = (v: unknown, fb: number, min = 0, max = 1e9) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fb;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

export function normalizeProgress(input: unknown): Progress {
  const d = defaultProgress();
  if (!input || typeof input !== 'object') return d;
  const p = input as Partial<Progress>;
  const tanks = {} as Record<TankId, TankProgress>;
  (Object.keys(d.tanks) as TankId[]).forEach((id) => {
    const raw = (p.tanks as Record<string, unknown> | undefined)?.[id] as Partial<TankProgress> | undefined;
    const upgrades = emptyUpgrades();
    if (raw?.upgrades && typeof raw.upgrades === 'object') {
      for (const u of UPGRADES) {
        const v = (raw.upgrades as Record<string, unknown>)[u.id];
        const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
        upgrades[u.id] = Math.max(0, Math.min(u.maxLevel, n));
      }
    }
    const camosRaw = Array.isArray(raw?.camos) ? raw!.camos as unknown[] : ['base'];
    const camos = [...new Set(camosRaw.filter((c): c is CamoId => typeof c === 'string' && (CAMO_ORDER as string[]).includes(c)))];
    if (!camos.includes('base')) camos.unshift('base');
    const camo: CamoId = typeof raw?.camo === 'string' && (camos as string[]).includes(raw.camo) ? (raw.camo as CamoId) : 'base';
    // Стартовый танк (unlockXp === 0) открыт всегда, остальные — только по сейву
    const mustUnlock = TANKS[id].unlockXp === 0;
    const unlocked = mustUnlock ? true : raw?.unlocked === true;
    tanks[id] = {
      unlocked,
      upgrades,
      goldUpgrade: raw?.goldUpgrade === true,
      camos: camos as CamoId[],
      camo,
    };
    // выбранный танк из сейва мог быть закрыт — unlocked для дефолтного t34 всегда true
    if (TANKS[id].unlockXp === 0) tanks[id].unlocked = true;
  });
  const sel: TankId = typeof p.selectedTank === 'string' && (tanks as Record<string, unknown>)[p.selectedTank] ? (p.selectedTank as TankId) : 't34';
  const xp = num(p.xp, d.xp);
  // старые сейвы без totalXp: звание не должно слетать от потраченного xp —
  // берём максимум из текущего баланса и сохранённого тотала
  const totalXp = Math.max(xp, num((p as Partial<Progress>).totalXp, xp));
  return {
    xp,
    totalXp,
    gold: num(p.gold, d.gold),
    selectedTank: sel,
    tanks,
    battles: num(p.battles, 0),
    wins: num(p.wins, 0),
    kills: num(p.kills, 0),
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    return normalizeProgress(JSON.parse(raw) as Progress);
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
