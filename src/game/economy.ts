// ===== Экономика боя: единый источник правды для наград =====
// Движок (finish) считает итог, BattleSetup показывает тарифы до боя.
// Раньше строки в BattleSetup были захардкожены и расходились с движком.

/** Награда за фраг */
export const REWARD_KILL = { xp: 130, gold: 6 } as const;
/** Награда за единицу урона (домножается на нанесённый урон, округляется) */
export const REWARD_DAMAGE = { xpPerDamage: 0.09, goldPerDamage: 0.004 } as const;
/** Награда за захват точки (capture) */
export const REWARD_CAPTURE = { xp: 90, gold: 8 } as const;
/** Награда за исход боя */
export const REWARD_OUTCOME = {
  win: { xp: 420, gold: 45 },
  draw: { xp: 200, gold: 20 },
  lose: { xp: 90, gold: 8 },
} as const;
/** Бонус за выживание (deathmatch, игрок жив) */
export const REWARD_SURVIVAL = { xp: 150, gold: 10 } as const;
/** Бонус за точность >60% при 5+ выстрелах */
export const REWARD_ACCURACY = { xp: 80, gold: 5, minShots: 5, minAcc: 0.6 } as const;

/** Короткая строка тарифа для UI (сводка до боя) */
export const REWARD_TEXT = {
  kill: `${REWARD_KILL.xp} XP · ${REWARD_KILL.gold} ◆`,
  damage100: `≈${Math.round(100 * REWARD_DAMAGE.xpPerDamage)} XP`,
  capture: `${REWARD_CAPTURE.xp} XP · ${REWARD_CAPTURE.gold} ◆`,
  survival: `${REWARD_SURVIVAL.xp} XP · ${REWARD_SURVIVAL.gold} ◆`,
  win: `${REWARD_OUTCOME.win.xp} XP · ${REWARD_OUTCOME.win.gold} ◆`,
  drawLose: `${REWARD_OUTCOME.draw.xp}·${REWARD_OUTCOME.draw.gold} / ${REWARD_OUTCOME.lose.xp}·${REWARD_OUTCOME.lose.gold}`,
} as const;
