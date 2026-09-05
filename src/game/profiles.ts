// ===== Аккаунты: несколько профилей + встроенный АДМИН =====
import { TankId, TANKS, CAMO_ORDER } from './config';
import { Progress, defaultProgress, normalizeProgress } from './progress';

export const ADMIN_NAME = 'АДМИН';
export const ADMIN_GOLD = 30000;
export const ADMIN_XP = 100000;

export interface Profiles {
  current: string;
  accounts: Record<string, Progress>;
}

const PKEY = 'steel-assault-profiles-v1';
const OLDKEY = 'steel-assault-progress-v1';

/** Пресет админа: 30 000 голды, 100 000 опыта, вся техника и камуфляжи открыты */
export function adminProgress(): Progress {
  const p = defaultProgress();
  p.gold = ADMIN_GOLD;
  p.xp = ADMIN_XP;
  (Object.keys(TANKS) as TankId[]).forEach((id) => {
    p.tanks[id].unlocked = true;
    p.tanks[id].camos = [...CAMO_ORDER];
  });
  return p;
}

export function loadProfiles(): Profiles {
  try {
    const raw = localStorage.getItem(PKEY);
    if (raw) {
      const pr = JSON.parse(raw) as Profiles;
      if (pr && pr.accounts && typeof pr.accounts === 'object' && pr.accounts[pr.current]) {
        for (const name of Object.keys(pr.accounts)) {
          pr.accounts[name] = normalizeProgress(pr.accounts[name]);
        }
        if (!pr.accounts[ADMIN_NAME]) pr.accounts[ADMIN_NAME] = adminProgress();
        return pr;
      }
    }
  } catch {
    /* ignore */
  }
  // миграция со старого одиночного сейва
  let old: Progress | null = null;
  try {
    const raw = localStorage.getItem(OLDKEY);
    if (raw) old = normalizeProgress(JSON.parse(raw) as Progress);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(OLDKEY);
  } catch {
    /* ignore */
  }
  const accounts: Record<string, Progress> = { [ADMIN_NAME]: adminProgress() };
  accounts['ИГРОК'] = old ?? defaultProgress();
  const pr: Profiles = { current: ADMIN_NAME, accounts };
  saveProfiles(pr);
  return pr;
}

export function saveProfiles(pr: Profiles) {
  try {
    localStorage.setItem(PKEY, JSON.stringify(pr));
  } catch {
    /* ignore */
  }
}

/** Создать аккаунт и сразу переключиться. null — имя пустое/занято */
export function addAccount(pr: Profiles, name: string): Profiles | null {
  const clean = name.trim().slice(0, 16);
  if (!clean || pr.accounts[clean]) return null;
  return { current: clean, accounts: { ...pr.accounts, [clean]: defaultProgress() } };
}

/** Удалить аккаунт. Админа и последний аккаунт удалить нельзя */
export function removeAccount(pr: Profiles, name: string): Profiles | null {
  if (name === ADMIN_NAME || !pr.accounts[name] || Object.keys(pr.accounts).length <= 1) return null;
  const accounts = { ...pr.accounts };
  delete accounts[name];
  return { current: pr.current === name ? ADMIN_NAME : pr.current, accounts };
}
