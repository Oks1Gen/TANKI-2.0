// ===== Система званий «СТАЛЬНОЙ ШТУРМ» (Вариант 2 — Стандарт) =====
// Прогрессия идёт по несгораемому totalXp (суммарно заработанный опыт).
// Текущий балансный xp продолжает тратиться на танки/прокачку и на звание не влияет.
//
// Кривая: табличная, аппроксимирует экспоненту ~1000 * n^1.7.
// При среднем доходе ~300 XP/бой: Лейтенант ~3-4 боя, Капитан ~17,
// Полковник ~90, Генерал ~300, Легенда ~800+ боёв.

import type { TankId } from './config';

export interface Rank {
  /** порядковый индекс 0..15 (0 = Рекрут, 1..15 — из ТЗ) */
  index: number;
  id: string;
  name: string;
  /** порог суммарного опыта для получения */
  xp: number;
  /** погон: звёзды */
  stars: number;
  /** крупные (генеральские) звёзды вместо мелких */
  bigStars: boolean;
  /** поперечные полосы/просветы на погоне 0..3 */
  stripes: number;
  /** цветовая группа погона */
  tier: 'recruit' | 'junior' | 'senior' | 'general' | 'legend';
  /** основной цвет оформления */
  color: string;
  /** префикс в чате / перед ником */
  chatPrefix: string;
  /** значок профиля (эмодзи/символ для UI без ассетов) */
  badge: string;
  /** бонус золота за получение звания */
  rewardGold: number;
  /** краткое описание открываемого контента */
  unlocks: string;
}

export const RANKS: Rank[] = [
  { index: 0, id: 'recruit', name: 'Рекрут', xp: 0, stars: 0, bigStars: false, stripes: 0, tier: 'recruit', color: '#8ea08c', chatPrefix: '[Р]', badge: '▫', rewardGold: 0, unlocks: 'Доступ к боям и прокачке' },
  { index: 1, id: 'lieutenant', name: 'Лейтенант', xp: 1000, stars: 1, bigStars: false, stripes: 1, tier: 'junior', color: '#b9ff3d', chatPrefix: '[Л-Т]', badge: '★', rewardGold: 100, unlocks: 'Лёгкий танк Т-100 ЛТ' },
  { index: 2, id: 'senior-lieutenant', name: 'Ст. лейтенант', xp: 2500, stars: 2, bigStars: false, stripes: 1, tier: 'junior', color: '#b9ff3d', chatPrefix: '[СТ.Л-Т]', badge: '★★', rewardGold: 200, unlocks: '+100 ◆ премии' },
  { index: 3, id: 'captain', name: 'Капитан', xp: 5000, stars: 3, bigStars: false, stripes: 1, tier: 'junior', color: '#d6ff7a', chatPrefix: '[КПТ]', badge: '★★★', rewardGold: 350, unlocks: 'Тяжёлый танк E 100' },
  { index: 4, id: 'major', name: 'Майор', xp: 10000, stars: 1, bigStars: false, stripes: 2, tier: 'senior', color: '#ffb424', chatPrefix: '[М-Р]', badge: '✦', rewardGold: 500, unlocks: 'Почётный знак профиля' },
  { index: 5, id: 'lt-colonel', name: 'Подполковник', xp: 17500, stars: 2, bigStars: false, stripes: 2, tier: 'senior', color: '#ffb424', chatPrefix: '[П/ПЛК]', badge: '✦✦', rewardGold: 750, unlocks: 'Префикс чата, премия 750 ◆' },
  { index: 6, id: 'colonel', name: 'Полковник', xp: 27500, stars: 3, bigStars: false, stripes: 2, tier: 'senior', color: '#ffcf5e', chatPrefix: '[ПЛК]', badge: '✦✦✦', rewardGold: 1000, unlocks: 'Премия 1 000 ◆' },
  { index: 7, id: 'brigadier', name: 'Бригадир', xp: 40000, stars: 1, bigStars: true, stripes: 0, tier: 'general', color: '#4aa3ff', chatPrefix: '[БРГ]', badge: '✪', rewardGold: 1500, unlocks: 'Генеральский погон' },
  { index: 8, id: 'major-general', name: 'Генерал-майор', xp: 55000, stars: 2, bigStars: true, stripes: 0, tier: 'general', color: '#4aa3ff', chatPrefix: '[Г-М]', badge: '✪✪', rewardGold: 2000, unlocks: 'Премия 2 000 ◆' },
  { index: 9, id: 'lt-general', name: 'Генерал-лейтенант', xp: 72500, stars: 3, bigStars: true, stripes: 0, tier: 'general', color: '#7ad0ff', chatPrefix: '[Г-Л]', badge: '✪✪✪', rewardGold: 2500, unlocks: 'Премия 2 500 ◆' },
  { index: 10, id: 'general', name: 'Генерал', xp: 92500, stars: 4, bigStars: true, stripes: 0, tier: 'general', color: '#7ad0ff', chatPrefix: '[ГЕН]', badge: '✪✪✪✪', rewardGold: 3000, unlocks: 'Премия 3 000 ◆' },
  { index: 11, id: 'marshal', name: 'Маршал', xp: 115000, stars: 1, bigStars: true, stripes: 3, tier: 'legend', color: '#ff5a5a', chatPrefix: '[МШЛ]', badge: '❖', rewardGold: 4000, unlocks: 'Маршальский погон' },
  { index: 12, id: 'field-marshal', name: 'Фельдмаршал', xp: 140000, stars: 2, bigStars: true, stripes: 3, tier: 'legend', color: '#ff8a5a', chatPrefix: '[ФДМ]', badge: '❖❖', rewardGold: 5000, unlocks: 'Премия 5 000 ◆' },
  { index: 13, id: 'commander', name: 'Командор', xp: 170000, stars: 3, bigStars: true, stripes: 3, tier: 'legend', color: '#ffd27a', chatPrefix: '[КМД]', badge: '❖❖❖', rewardGold: 6500, unlocks: 'Премия 6 500 ◆' },
  { index: 14, id: 'generalissimo', name: 'Генералиссимус', xp: 200000, stars: 4, bigStars: true, stripes: 3, tier: 'legend', color: '#ffe9b0', chatPrefix: '[ГЕНС]', badge: '👑', rewardGold: 8000, unlocks: 'Премия 8 000 ◆' },
  { index: 15, id: 'legend', name: 'Легенда', xp: 250000, stars: 5, bigStars: true, stripes: 3, tier: 'legend', color: '#ffffff', chatPrefix: '[★ЛЕГЕНДА★]', badge: '🏆', rewardGold: 12000, unlocks: 'Высшее звание, премия 12 000 ◆' },
];

/** Минимальное звание (индекс) для доступа к технике — эксклюзивный контент за ранг. */
export const TANK_RANK_REQ: Record<TankId, number> = {
  t34: 0, // стартовая — всем
  t100lt: 1, // Лейтенант (1 000)
  e100: 3, // Капитан (5 000)
};

export function rankNameForTank(tank: TankId): string {
  return RANKS[TANK_RANK_REQ[tank] ?? 0].name;
}

/** Индекс ранга по суммарному опыту (бинарный поиск по порогам). */
export function getRankIndex(totalXp: number): number {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  let lo = 0;
  let hi = RANKS.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (RANKS[mid].xp <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function getRank(totalXp: number): Rank {
  return RANKS[getRankIndex(totalXp)];
}

export function getNextRank(totalXp: number): Rank | null {
  const i = getRankIndex(totalXp);
  return i + 1 < RANKS.length ? RANKS[i + 1] : null;
}

export interface RankProgress {
  current: Rank;
  next: Rank | null;
  /** порог текущего ранга */
  currentXp: number;
  /** порог следующего ранга (для макс. = свой же) */
  nextXp: number;
  /** всего опыта у игрока */
  have: number;
  /** набрано внутри текущего ранга */
  into: number;
  /** длина текущего ранга в XP */
  span: number;
  /** 0..1 */
  pct: number;
  /** осталось до следующего (0 для макс.) */
  remaining: number;
  isMax: boolean;
}

export function getRankProgress(totalXp: number): RankProgress {
  const have = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  const current = getRank(have);
  const next = getNextRank(have);
  if (!next) {
    return { current, next: null, currentXp: current.xp, nextXp: current.xp, have, into: have - current.xp, span: 1, pct: 1, remaining: 0, isMax: true };
  }
  const span = Math.max(1, next.xp - current.xp);
  const into = Math.max(0, have - current.xp);
  return {
    current,
    next,
    currentXp: current.xp,
    nextXp: next.xp,
    have,
    into,
    span,
    pct: Math.max(0, Math.min(1, into / span)),
    remaining: Math.max(0, next.xp - have),
    isMax: false,
  };
}

/** Суммарная награда золотом за проход рангов (fromIdx, toIdx] — для мульти-апа за бой. */
export function promotionGoldReward(fromIdx: number, toIdx: number): number {
  if (toIdx <= fromIdx) return 0;
  let sum = 0;
  for (let i = fromIdx + 1; i <= toIdx && i < RANKS.length; i++) sum += RANKS[i].rewardGold;
  return sum;
}

/** Ник с префиксом звания для чата/профиля. */
export function formatChatName(account: string, totalXp: number): string {
  return `${getRank(totalXp).chatPrefix} ${account}`;
}

/** Хватает ли звания для танка. */
export function canUseTank(totalXp: number, tank: TankId): boolean {
  return getRankIndex(totalXp) >= (TANK_RANK_REQ[tank] ?? 0);
}
