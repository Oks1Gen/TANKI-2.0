// ===== Основные типы и конфигурация игры «СТАЛЬНОЙ ШТУРМ» =====

export type TankId = 'e100' | 't34' | 't100lt';
export type ShellType = 'AP' | 'HEAT' | 'HE';
export type GameMode = 'deathmatch' | 'capture';
export type Biome = 'forest' | 'desert' | 'winter' | 'mountains';
export type TimeOfDay = 'night' | 'dawn' | 'morning' | 'day' | 'noon' | 'evening' | 'sunset' | 'dusk';
export type Weather = 'clear' | 'rain' | 'fog' | 'snow' | 'storm';
export type Duration = 'short' | 'medium' | 'long';
export type CamoId = 'base' | 'forest' | 'desert' | 'winter';
export type UpgradeId = 'gun' | 'engine' | 'armor' | 'sight' | 'ammo' | 'suspension';
export type Team = 0 | 1; // 0 = синие (игрок), 1 = красные

export interface TankSpec {
  id: TankId;
  name: string;
  role: string;
  desc: string;
  hp: number;
  speed: number; // м/с
  reverseSpeed: number;
  accel: number;
  hullTurn: number; // рад/с
  turretTurn: number; // рад/с
  reload: number; // сек
  damage: number;
  shellSpeed: number;
  ammo: { AP: number; HEAT: number; HE: number };
  unlockXp: number;
  radius: number; // радиус коллизии
  scale: { length: number; width: number; height: number; turret: number; barrel: number };
  goldUpgrade: { name: string; desc: string; cost: number; kind: 'magazine' | 'heavygun' };
}

export const TANKS: Record<TankId, TankSpec> = {
  e100: {
    id: 'e100',
    name: 'E 100',
    role: 'Тяжёлый танк',
    desc: 'Стальная крепость. Медленный, но каждый выстрел меняет расклад боя.',
    hp: 2400,
    speed: 7.5,
    reverseSpeed: 4,
    accel: 3.5,
    hullTurn: 0.85,
    turretTurn: 1.0,
    reload: 9.5,
    damage: 520,
    shellSpeed: 110,
    ammo: { AP: 18, HEAT: 8, HE: 8 },
    unlockXp: 4500,
    radius: 4.2,
    scale: { length: 11, width: 5.2, height: 2.6, turret: 1.5, barrel: 7 },
    goldUpgrade: { name: 'Усиленное орудие 15 см', desc: '+22% урона и +8% скорости снаряда', cost: 900, kind: 'heavygun' },
  },
  t34: {
    id: 't34',
    name: 'Т-34',
    role: 'Средний танк',
    desc: 'Универсальная машина. Хорош в любой роли, не имеет слабых мест.',
    hp: 1400,
    speed: 12.5,
    reverseSpeed: 6,
    accel: 6,
    hullTurn: 1.6,
    turretTurn: 2.0,
    reload: 5.2,
    damage: 250,
    shellSpeed: 130,
    ammo: { AP: 28, HEAT: 12, HE: 12 },
    unlockXp: 0,
    radius: 3.2,
    scale: { length: 8.2, width: 4.2, height: 1.9, turret: 1.1, barrel: 5.4 },
    goldUpgrade: { name: 'Барабан заряжания', desc: 'Магазин на 3 снаряда, быстрая внутрибарабанная перезарядка', cost: 700, kind: 'magazine' },
  },
  t100lt: {
    id: 't100lt',
    name: 'Т-100 ЛТ',
    role: 'Лёгкий танк',
    desc: 'Хищник флангов. Скорость и скорострельность взамен брони.',
    hp: 900,
    speed: 18,
    reverseSpeed: 8,
    accel: 9,
    hullTurn: 2.5,
    turretTurn: 3.4,
    reload: 2.6,
    damage: 135,
    shellSpeed: 145,
    ammo: { AP: 40, HEAT: 16, HE: 16 },
    unlockXp: 1800,
    radius: 2.7,
    scale: { length: 7, width: 3.6, height: 1.4, turret: 0.8, barrel: 4.6 },
    goldUpgrade: { name: 'Автомат заряжания', desc: 'Магазин на 4 снаряда, быстрая внутрибарабанная перезарядка', cost: 700, kind: 'magazine' },
  },
};

export const TANK_ORDER: TankId[] = ['t34', 't100lt', 'e100'];

export interface ShellSpec {
  id: ShellType;
  name: string;
  short: string;
  desc: string;
  tankMul: number;
  buildingMul: number;
  splash: number; // радиус
  moduleChance: number;
  speedMul: number;
  color: number;
}

export const SHELLS: Record<ShellType, ShellSpec> = {
  AP: { id: 'AP', name: 'Бронебойный', short: 'ББ', desc: 'Надёжный прямой урон по технике', tankMul: 1.0, buildingMul: 0.6, splash: 0, moduleChance: 0.25, speedMul: 1.0, color: 0xffd27a },
  HEAT: { id: 'HEAT', name: 'Кумулятивный', short: 'КС', desc: 'Прожигает укрепления, хорош по постройкам', tankMul: 0.9, buildingMul: 2.2, splash: 2.5, moduleChance: 0.3, speedMul: 0.85, color: 0x7ad0ff },
  HE: { id: 'HE', name: 'Фугасный', short: 'ОФ', desc: 'Большой радиус, ломает модули и лёгкие объекты', tankMul: 0.6, buildingMul: 1.8, splash: 7, moduleChance: 0.6, speedMul: 0.8, color: 0xff8a5a },
};

export const SHELL_ORDER: ShellType[] = ['AP', 'HEAT', 'HE'];

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  desc: string;
  perLevel: string;
  maxLevel: number;
  baseCost: number;
}

export const UPGRADES: UpgradeSpec[] = [
  { id: 'gun', name: 'Орудие', desc: 'Модернизация ствола и казённика', perLevel: '+6% урона', maxLevel: 5, baseCost: 300 },
  { id: 'engine', name: 'Двигатель', desc: 'Форсирование силовой установки', perLevel: '+5% скорости', maxLevel: 5, baseCost: 260 },
  { id: 'armor', name: 'Броня', desc: 'Дополнительные экраны и наварная броня', perLevel: '+7% прочности', maxLevel: 5, baseCost: 320 },
  { id: 'sight', name: 'Прицел', desc: 'Стабилизатор и приводы башни', perLevel: '+8% поворота башни', maxLevel: 5, baseCost: 220 },
  { id: 'ammo', name: 'Боеукладка', desc: 'Улучшенная укладка снарядов', perLevel: '-5% перезарядки, +10% БК', maxLevel: 5, baseCost: 280 },
  { id: 'suspension', name: 'Ходовая', desc: 'Усиленные торсионы и катки', perLevel: '+7% поворота корпуса', maxLevel: 5, baseCost: 200 },
];

export function upgradeCost(spec: UpgradeSpec, currentLevel: number) {
  return Math.round(spec.baseCost * (1 + currentLevel * 0.9));
}

export interface CamoSpec {
  id: CamoId;
  name: string;
  cost: number;
  colors: [number, number, number];
}

export const CAMOS: Record<CamoId, CamoSpec> = {
  base: { id: 'base', name: 'Базовый', cost: 0, colors: [0x4f5a3c, 0x4f5a3c, 0x4a533a] },
  forest: { id: 'forest', name: 'Лесной', cost: 250, colors: [0x3f5a32, 0x6b6a3a, 0x2c3a26] },
  desert: { id: 'desert', name: 'Пустынный', cost: 250, colors: [0xb59a63, 0x8f7648, 0xd1b98a] },
  winter: { id: 'winter', name: 'Зимний', cost: 250, colors: [0xdfe3e6, 0x9aa3a8, 0xc7ced2] },
};

export const CAMO_ORDER: CamoId[] = ['base', 'forest', 'desert', 'winter'];

export const BIOME_NAMES: Record<Biome, string> = { forest: 'Лес', desert: 'Пустыня', winter: 'Зима', mountains: 'Горы' };
export const TIME_NAMES: Record<TimeOfDay, string> = { night: 'Ночь', dawn: 'Рассвет', morning: 'Утро', day: 'День', noon: 'Полдень', evening: 'Вечер', sunset: 'Закат', dusk: 'Сумерки' };
export const WEATHER_NAMES: Record<Weather, string> = { clear: 'Ясно', rain: 'Дождь', fog: 'Туман', snow: 'Снег', storm: 'Гроза' };
export const MODE_NAMES: Record<GameMode, string> = { deathmatch: 'Бой насмерть', capture: 'Захват точек' };
export const DURATION_NAMES: Record<Duration, string> = { short: 'Короткий', medium: 'Средний', long: 'Длинный' };
export const DURATION_SECONDS: Record<Duration, number> = { short: 180, medium: 300, long: 480 };

export const BIOMES: Biome[] = ['forest', 'desert', 'winter', 'mountains'];
export const TIMES: TimeOfDay[] = ['night', 'dawn', 'morning', 'day', 'noon', 'evening', 'sunset', 'dusk'];
export const WEATHERS: Weather[] = ['clear', 'rain', 'fog', 'snow', 'storm'];

export interface BattleConfig {
  mode: GameMode;
  biome: Biome;
  time: TimeOfDay;
  weather: Weather;
  duration: Duration;
  bots: number;
  tank: TankId;
  camo: CamoId;
  upgrades: Record<UpgradeId, number>;
  goldUpgrade: boolean;
}

export interface BattleResult {
  outcome: 'win' | 'lose' | 'draw';
  mode: GameMode;
  score: { blue: number; red: number };
  kills: number;
  damage: number;
  captures: number;
  shotsFired: number;
  shotsHit: number;
  survived: boolean;
  timeAlive: number;
  xp: number;
  gold: number;
  breakdown: { label: string; xp: number; gold: number }[];
}

// Эффективные характеристики с учётом прокачки
export interface EffectiveStats {
  hp: number;
  speed: number;
  reverseSpeed: number;
  accel: number;
  hullTurn: number;
  turretTurn: number;
  reload: number;
  damage: number;
  shellSpeed: number;
  ammo: { AP: number; HEAT: number; HE: number };
  magazine: number; // 1 = обычное орудие
  magazineReload: number; // внутрибарабанная
}

export function computeStats(id: TankId, up: Record<UpgradeId, number>, goldUpgrade: boolean): EffectiveStats {
  const s = TANKS[id];
  const ammoMul = 1 + up.ammo * 0.1;
  let damage = s.damage * (1 + up.gun * 0.06);
  let shellSpeed = s.shellSpeed;
  let magazine = 1;
  let magazineReload = 0;
  let reload = s.reload * (1 - up.ammo * 0.05);
  if (goldUpgrade) {
    if (s.goldUpgrade.kind === 'heavygun') {
      damage *= 1.22;
      shellSpeed *= 1.08;
    } else {
      magazine = id === 't100lt' ? 4 : 3;
      magazineReload = id === 't100lt' ? 0.8 : 1.6;
      reload *= id === 't100lt' ? 3.2 : 2.6;
    }
  }
  return {
    hp: Math.round(s.hp * (1 + up.armor * 0.07)),
    speed: s.speed * (1 + up.engine * 0.05),
    reverseSpeed: s.reverseSpeed * (1 + up.engine * 0.05),
    accel: s.accel * (1 + up.engine * 0.04),
    hullTurn: s.hullTurn * (1 + up.suspension * 0.07),
    turretTurn: s.turretTurn * (1 + up.sight * 0.08),
    reload,
    damage: Math.round(damage),
    shellSpeed,
    ammo: { AP: Math.round(s.ammo.AP * ammoMul), HEAT: Math.round(s.ammo.HEAT * ammoMul), HE: Math.round(s.ammo.HE * ammoMul) },
    magazine,
    magazineReload,
  };
}

export const ARENA_SIZE = 170; // сторона арены
export const BOT_NAMES = ['Гроза', 'Барс', 'Кедр', 'Молот', 'Сокол', 'Вихрь', 'Ястреб', 'Клин', 'Байкал', 'Тайфун', 'Кремень', 'Зубр', 'Рысь', 'Утёс'];
