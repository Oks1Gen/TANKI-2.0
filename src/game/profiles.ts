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

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export function isValidAccountName(name: string): boolean {
  const clean = name.trim();
  if (!clean || clean.length > 16) return false;
  if (FORBIDDEN.has(clean) || FORBIDDEN.has(clean.toLowerCase())) return false;
  return true;
}

function sanitizeName(name: string): string {
  return name.trim().slice(0, 16);
}

/** Пресет админа: 30 000 голды, 100 000 опыта, вся техника и камуфляжи открыты */
export function adminProgress(): Progress {
  const p = defaultProgress();
  p.gold = ADMIN_GOLD;
  p.xp = ADMIN_XP;
  p.totalXp = ADMIN_XP;
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
      const acc = (pr as { accounts?: unknown })?.accounts;
      if (pr && acc && typeof acc === 'object' && !Array.isArray(acc)) {
        const names = Object.keys(acc as Record<string, unknown>).filter((n) => !FORBIDDEN.has(n));
        if (names.length > 0) {
          const src = acc as Record<string, unknown>;
          const fixed: Record<string, Progress> = {};
          for (const name of names) {
            try {
              fixed[name] = normalizeProgress(src[name]);
            } catch {
              fixed[name] = defaultProgress();
            }
          }
          // чиним current вместо вайпа всех профилей
          let current = typeof pr.current === 'string' ? pr.current : '';
          if (!hasOwn(fixed, current)) {
            current = hasOwn(fixed, ADMIN_NAME) ? ADMIN_NAME : names[0];
          }
          if (!hasOwn(fixed, ADMIN_NAME)) fixed[ADMIN_NAME] = adminProgress();
          return { current, accounts: fixed };
        }
      }
    }
  } catch {
    /* ignore — ниже миграция/свежие профили, сейв не затираем вслепую */
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
  const clean = sanitizeName(name);
  if (!isValidAccountName(clean) || hasOwn(pr.accounts, clean)) return null;
  return { current: clean, accounts: { ...pr.accounts, [clean]: defaultProgress() } };
}

/** Удалить аккаунт. Админа и последний аккаунт удалить нельзя */
export function removeAccount(pr: Profiles, name: string): Profiles | null {
  if (name === ADMIN_NAME || !hasOwn(pr.accounts, name) || Object.keys(pr.accounts).length <= 1) return null;
  const accounts = { ...pr.accounts };
  delete accounts[name];
  const next = pr.current === name ? ADMIN_NAME : pr.current;
  return { current: hasOwn(accounts, next) ? next : ADMIN_NAME, accounts };
}

/** Экспорт всех профилей в JSON-файл (бэкап от чистки localStorage) */
export function exportProfiles(pr: Profiles) {
  try {
    const blob = new Blob([JSON.stringify(pr, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'steel-assault-save.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Импорт профилей из JSON-файла. Возвращает Profiles или null при битом файле */
export function importProfilesJson(text: string): Profiles | null {
  try {
    const parsed = JSON.parse(text) as Partial<Profiles>;
    const acc = (parsed as { accounts?: unknown })?.accounts;
    if (!parsed || !acc || typeof acc !== 'object' || Array.isArray(acc)) return null;
    const src = acc as Record<string, unknown>;
    const fixed: Record<string, Progress> = {};
    for (const name of Object.keys(src)) {
      if (FORBIDDEN.has(name) || typeof name !== 'string' || !name.trim() || name.length > 16) continue;
      try {
        fixed[name] = normalizeProgress(src[name]);
      } catch {
        continue;
      }
    }
    if (Object.keys(fixed).length === 0) return null;
    if (!hasOwn(fixed, ADMIN_NAME)) fixed[ADMIN_NAME] = adminProgress();
    const cur = typeof parsed.current === 'string' && hasOwn(fixed, parsed.current) ? parsed.current : ADMIN_NAME;
    return { current: cur, accounts: fixed };
  } catch {
    return null;
  }
}
