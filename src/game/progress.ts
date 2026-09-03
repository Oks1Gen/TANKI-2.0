import { TankId, UpgradeId, CamoId, TANKS, UPGRADES } from './config';

export interface TankProgress {
  unlocked: boolean;
  upgrades: Record<UpgradeId, number>;
  goldUpgrade: boolean;
  camos: CamoId[];
  camo: CamoId;
}

export interface Progress {
  xp: number;
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
  return { xp: 600, gold: 150, selectedTank: 't34', tanks, battles: 0, wins: 0, kills: 0 };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    const p = JSON.parse(raw) as Progress;
    const d = defaultProgress();
    // мягкая миграция
    (Object.keys(d.tanks) as TankId[]).forEach((id) => {
      if (!p.tanks[id]) p.tanks[id] = d.tanks[id];
      p.tanks[id].upgrades = { ...emptyUpgrades(), ...p.tanks[id].upgrades };
    });
    return { ...d, ...p };
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
