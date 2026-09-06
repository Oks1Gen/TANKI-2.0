import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_SIZE, BattleConfig, Biome, TimeOfDay, Weather } from './config';

// Заморозка статики: three.js иначе каждый кадр пересчитывает матрицы ВСЕХ объектов
// (~700 штук здесь) из position/quaternion/scale. Для неподвижного вызываем один раз.
export function freezeStatic(root: THREE.Object3D) {
  root.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
  root.updateMatrixWorld(true);
}

// Клон геометрии с трансформацией — для merge мелких деталей в 1 меш (меньше draw calls)
const _xe = new THREE.Euler();
const _xq = new THREE.Quaternion();
const _xp = new THREE.Vector3();
const _xs = new THREE.Vector3();
const _xm = new THREE.Matrix4();
function xg(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.BufferGeometry {
  const g = geo.clone();
  _xe.set(rx, ry, rz);
  _xq.setFromEuler(_xe);
  _xp.set(x, y, z);
  _xs.set(sx, sy, sz);
  _xm.compose(_xp, _xq, _xs);
  g.applyMatrix4(_xm);
  return g;
}

function mergedMesh(parts: THREE.BufferGeometry[], mat: THREE.Material, disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[], shadows: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh | null {
  if (!parts.length) return null;
  const geo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  disposables.push(geo);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows.cast ?? false;
  m.receiveShadow = shadows.receive ?? false;
  return m;
}

export type ObstacleKind = 'building' | 'hangar' | 'bunker' | 'concrete' | 'barrier' | 'crate' | 'rock' | 'tree' | 'hill' | 'wall' | 'lamp';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  shape: 'box' | 'circle';
  x: number;
  z: number;
  hw: number; // половина ширины (x)
  hd: number; // половина глубины (z)
  r: number; // радиус для круга
  h: number;
  hp: number;
  maxHp: number;
  destructible: boolean;
  alive: boolean;
  mesh: THREE.Object3D;
  blocksShots: boolean;
  /** крупные руины (дом/ангар) продолжают блокировать движение уменьшенным футпринтом */
  rubble?: boolean;
}

export interface PickupType {
  id: 'repair' | 'speed' | 'damage' | 'ammo';
  name: string;
  color: number;
}

export const PICKUP_TYPES: Record<PickupType['id'], PickupType> = {
  repair: { id: 'repair', name: 'Ремкомплект', color: 0x62ff7a },
  speed: { id: 'speed', name: 'Форсаж', color: 0x5ad8ff },
  damage: { id: 'damage', name: 'Усиленный заряд', color: 0xff7a3c },
  ammo: { id: 'ammo', name: 'Боеприпасы', color: 0xffd84a },
};

export interface Pickup {
  id: number;
  type: PickupType;
  x: number;
  z: number;
  active: boolean;
  respawnIn: number;
  mesh: THREE.Group;
}

export interface CapPoint {
  id: number;
  letter: string;
  x: number;
  z: number;
  radius: number;
  owner: -1 | 0 | 1;
  progress: number; // -1..1 : отрицательное — красные, положительное — синие
  capturing: -1 | 0 | 1;
  contested: boolean;
  ring: THREE.Mesh;
  beacon: THREE.Mesh;
  fill: THREE.Mesh;
  light: THREE.PointLight;
  label: THREE.Sprite;
  blockedTimer: number;
}

export interface Environment {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  fogColor: THREE.Color;
  isNight: boolean;
  darkFactor: number; // 0 = день, 1 = глубокая ночь (время + погода)
  visibility: number;
  skyColor: THREE.Color;
  sunDir: THREE.Vector3;
}

export interface Lamp {
  x: number;
  z: number;
  light: THREE.PointLight;
  headMat: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  ground: THREE.Mesh;
  baseIntensity: number;
  phase: number;
}

export interface World {
  obstacles: Obstacle[];
  pickups: Pickup[];
  capPoints: CapPoint[];
  lamps: Lamp[];
  env: Environment;
  groundColor: THREE.Color;
  half: number;
  minimapObstacles: { x: number; z: number; w: number; d: number; kind: ObstacleKind }[];
  dispose: () => void;
}

// ---------- Псевдослучайный генератор ----------
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Палитры биомов ----------
interface BiomePalette {
  ground: number;
  ground2: number;
  road: number;
  rock: number;
  building: number;
  roof: number;
  crate: number;
  barrier: number;
  tree: number;
  trunk: number;
  treeDensity: number;
  hillColor: number;
}

const PALETTES: Record<Biome, BiomePalette> = {
  forest: { ground: 0x3f5a2e, ground2: 0x2f4623, road: 0x4a4638, rock: 0x6c6c66, building: 0x8b8474, roof: 0x5a3f33, crate: 0x7a6238, barrier: 0x8a8a84, tree: 0x2f5a2a, trunk: 0x4a3524, treeDensity: 1, hillColor: 0x3a4f2c },
  desert: { ground: 0xc4a66a, ground2: 0xb3955c, road: 0x8f7a56, rock: 0xa8906a, building: 0xd9c39a, roof: 0xb79a6c, crate: 0x8f7040, barrier: 0xc9b58e, tree: 0x6f7a3c, trunk: 0x6b5236, treeDensity: 0.15, hillColor: 0xb89a66 },
  winter: { ground: 0xe3e8ec, ground2: 0xc9d1d8, road: 0x8b9298, rock: 0x7d858c, building: 0x9aa1a6, roof: 0xe8ecef, crate: 0x6e5a3c, barrier: 0xa9b1b6, tree: 0x2c4a3a, trunk: 0x3d2f24, treeDensity: 0.6, hillColor: 0xd5dbe0 },
  mountains: { ground: 0x6f6b62, ground2: 0x5b5850, road: 0x4f4c46, rock: 0x7f7d78, building: 0x8e8a80, roof: 0x4e4a44, crate: 0x7a6238, barrier: 0x8f8e88, tree: 0x3b5a3a, trunk: 0x4b3a2c, treeDensity: 0.35, hillColor: 0x6a675f },
};

// ---------- Освещение по времени суток ----------
export interface TimePreset {
  sky: number;
  fog: number;
  sun: number;
  sunI: number;
  elev: number;
  azim: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  amb: number;
  night: boolean;
}

/** Единый источник правды для превью освещения в настройке боя (sky/night/sunI). */
export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  night: { sky: 0x070a12, fog: 0x0a0e18, sun: 0x8090c0, sunI: 0.25, elev: 0.5, azim: 2.2, hemiSky: 0x1a2340, hemiGround: 0x0a0c10, hemiI: 0.35, amb: 0x0d1220, night: true },
  dawn: { sky: 0x6e6f9a, fog: 0x8d7f93, sun: 0xffa070, sunI: 1.0, elev: 0.18, azim: 1.0, hemiSky: 0x7a7fa8, hemiGround: 0x3a3230, hemiI: 0.55, amb: 0x302838, night: false },
  morning: { sky: 0x9cc0e6, fog: 0xb9cbe0, sun: 0xfff0d0, sunI: 1.8, elev: 0.55, azim: 1.1, hemiSky: 0x9cc0e6, hemiGround: 0x4a4a3a, hemiI: 0.6, amb: 0x3a4048, night: false },
  day: { sky: 0x86b4e6, fog: 0xa9c4e2, sun: 0xffffff, sunI: 2.2, elev: 0.95, azim: 0.7, hemiSky: 0x86b4e6, hemiGround: 0x4f4c3c, hemiI: 0.65, amb: 0x404850, night: false },
  noon: { sky: 0x78aae6, fog: 0xa0bde0, sun: 0xffffff, sunI: 2.6, elev: 1.35, azim: 0.4, hemiSky: 0x78aae6, hemiGround: 0x555040, hemiI: 0.7, amb: 0x454c55, night: false },
  evening: { sky: 0xc78c66, fog: 0xc09a80, sun: 0xffb070, sunI: 1.5, elev: 0.32, azim: -1.4, hemiSky: 0xc08a6a, hemiGround: 0x3d3128, hemiI: 0.5, amb: 0x3a2e28, night: false },
  sunset: { sky: 0xd06a4a, fog: 0xc07a60, sun: 0xff7a40, sunI: 1.3, elev: 0.14, azim: -1.7, hemiSky: 0xd07a5a, hemiGround: 0x2e2420, hemiI: 0.45, amb: 0x3a2420, night: false },
  dusk: { sky: 0x2c2e50, fog: 0x3a3a58, sun: 0x9a80c0, sunI: 0.5, elev: 0.08, azim: -2.0, hemiSky: 0x3c3e66, hemiGround: 0x1a1a20, hemiI: 0.4, amb: 0x1c1c30, night: true },
};

// 0 = день, 1 = глубокая ночь. Учитывает время суток + погоду (туман/гроза тоже затемняют).
/** Порог затемнения, выше которого включаются фары/фонари. Единый для движка и UI сетапа. */
export const LIGHTS_DARK_THRESHOLD = 0.35;
export function getDarkFactor(time: TimeOfDay, weather: Weather): number {
  const base: Record<TimeOfDay, number> = {
    night: 1.0,
    dusk: 0.85,
    sunset: 0.65,
    evening: 0.45,
    dawn: 0.32,
    morning: 0.05,
    day: 0,
    noon: 0,
  };
  let d = base[time] ?? 0;
  if (weather === 'fog') d += 0.25;
  else if (weather === 'storm') d += 0.35;
  else if (weather === 'rain') d += 0.15;
  else if (weather === 'snow') d += 0.05;
  return Math.max(0, Math.min(1, d));
}

export function setupEnvironment(scene: THREE.Scene, cfg: BattleConfig): Environment {
  const tp = TIME_PRESETS[cfg.time];
  const w: Weather = cfg.weather;
  const darkFactor = getDarkFactor(cfg.time, cfg.weather);
  const sky = new THREE.Color(tp.sky);
  const fog = new THREE.Color(tp.fog);
  let sunI = tp.sunI;
  let visibility = 1;
  if (w === 'rain') {
    sky.multiplyScalar(0.6);
    fog.multiplyScalar(0.65);
    sunI *= 0.55;
    visibility = 0.75;
  } else if (w === 'storm') {
    sky.multiplyScalar(0.4);
    fog.multiplyScalar(0.45);
    sunI *= 0.35;
    visibility = 0.6;
  } else if (w === 'fog') {
    fog.lerp(new THREE.Color(0xffffff), 0.15);
    sky.lerp(fog, 0.6);
    sunI *= 0.6;
    visibility = 0.35;
  } else if (w === 'snow') {
    sky.lerp(new THREE.Color(0xdde4ea), 0.35);
    fog.lerp(new THREE.Color(0xe8eef2), 0.45);
    sunI *= 0.7;
    visibility = 0.65;
  }
  if (cfg.biome === 'winter' && !tp.night) fog.lerp(new THREE.Color(0xeef3f6), 0.3);
  if (cfg.biome === 'desert' && !tp.night) fog.lerp(new THREE.Color(0xf0d9a8), 0.35);

  scene.background = sky;
  const density = (0.0035 + (1 - visibility) * 0.02) * (1 + darkFactor * 0.25);
  scene.fog = new THREE.FogExp2(fog.getHex(), density);

  const sun = new THREE.DirectionalLight(tp.sun, sunI);
  const dist = 140;
  sun.position.set(Math.cos(tp.azim) * Math.cos(tp.elev) * dist, Math.sin(tp.elev) * dist + 10, Math.sin(tp.azim) * Math.cos(tp.elev) * dist);
  sun.castShadow = true;
  // 1024 вместо 2048: shadow-pass в 4 раза дешевле, на такой камере разницы почти не видно.
  // Камера теней ужата до 95м — солнце следует за игроком (см. engine), большую карту крыть не нужно.
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 460;
  const sh = 95;
  sun.shadow.camera.left = -sh;
  sun.shadow.camera.right = sh;
  sun.shadow.camera.top = sh;
  sun.shadow.camera.bottom = -sh;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(tp.hemiSky, tp.hemiGround, tp.hemiI * (w === 'storm' ? 0.6 : 1));
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(tp.amb, 1.0);
  scene.add(ambient);

  const isNight = tp.night || darkFactor > LIGHTS_DARK_THRESHOLD;
  return { sun, hemi, ambient, fogColor: fog, isNight, darkFactor, visibility, skyColor: sky, sunDir: sun.position.clone().normalize() };
}

// ---------- Текстура земли ----------
function groundTexture(biome: Biome, rnd: () => number): THREE.Texture {
  const p = PALETTES[biome];
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  ctx.fillStyle = hex(p.ground);
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? hex(p.ground2) : hex(p.ground);
    ctx.globalAlpha = 0.25 + rnd() * 0.5;
    const s = 4 + rnd() * 24;
    ctx.beginPath();
    ctx.ellipse(rnd() * 512, rnd() * 512, s, s * (0.4 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.1})`;
    ctx.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.round((ARENA_SIZE * 3) / 36), Math.round((ARENA_SIZE * 3) / 36));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function letterSprite(letter: string, disposables?: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[]): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 96px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 12;
  ctx.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  if (disposables) disposables.push(tex, mat);
  const s = new THREE.Sprite(mat);
  s.scale.set(5, 5, 1);
  return s;
}

// ---------- Построение мира ----------
export function buildWorld(scene: THREE.Scene, cfg: BattleConfig, seed: number): World {
  const rnd = mulberry(seed);
  const p = PALETTES[cfg.biome];
  const half = ARENA_SIZE / 2;
  const env = setupEnvironment(scene, cfg);
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  // Земля
  const gTex = groundTexture(cfg.biome, rnd);
  disposables.push(gTex);
  const groundGeo = new THREE.PlaneGeometry(ARENA_SIZE * 3, ARENA_SIZE * 3, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ map: gTex, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  freezeStatic(ground);
  scene.add(ground);
  disposables.push(groundGeo, groundMat);

  const obstacles: Obstacle[] = [];
  const minimapObstacles: World['minimapObstacles'] = [];
  let oid = 1;

  const rockMat = new THREE.MeshStandardMaterial({ color: p.rock, roughness: 0.95, flatShading: true });
  const hillMat = new THREE.MeshStandardMaterial({ color: p.hillColor, roughness: 1, flatShading: true });
  const buildingMat = new THREE.MeshStandardMaterial({ color: p.building, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: p.roof, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ color: p.crate, roughness: 0.85 });
  const barrierMat = new THREE.MeshStandardMaterial({ color: p.barrier, roughness: 0.9 });
  const treeMat = new THREE.MeshStandardMaterial({ color: p.tree, roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: p.trunk, roughness: 1 });
  const roadMat = new THREE.MeshStandardMaterial({ color: p.road, roughness: 1, transparent: true, opacity: 0.85 });
  const craterMat = new THREE.MeshStandardMaterial({ color: 0x1e1c18, roughness: 1, transparent: true, opacity: 0.55 });
  disposables.push(rockMat, hillMat, buildingMat, roofMat, crateMat, barrierMat, treeMat, trunkMat, roadMat, craterMat);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(boxGeo);

  const addBox = (kind: ObstacleKind, x: number, z: number, w: number, d: number, h: number, mesh: THREE.Object3D, hp: number, destructible: boolean, blocksShots = true) => {
    mesh.position.set(x, 0, z);
    freezeStatic(mesh);
    scene.add(mesh);
    obstacles.push({ id: oid++, kind, shape: 'box', x, z, hw: w / 2, hd: d / 2, r: Math.hypot(w, d) / 2, h, hp, maxHp: hp, destructible, alive: true, mesh, blocksShots });
    minimapObstacles.push({ x, z, w, d, kind });
  };
  const addCircle = (kind: ObstacleKind, x: number, z: number, r: number, h: number, mesh: THREE.Object3D, blocksShots = true) => {
    mesh.position.set(x, 0, z);
    freezeStatic(mesh);
    scene.add(mesh);
    obstacles.push({ id: oid++, kind, shape: 'circle', x, z, hw: r, hd: r, r, h, hp: 1e9, maxHp: 1e9, destructible: false, alive: true, mesh, blocksShots });
    minimapObstacles.push({ x, z, w: r * 2, d: r * 2, kind });
  };

  // Точки захвата — резервируем места
  const capSpots = cfg.mode === 'capture' ? [
    { x: -half * 0.55, z: -half * 0.1, letter: 'A' },
    { x: 0, z: half * 0.05, letter: 'B' },
    { x: half * 0.55, z: -half * 0.1, letter: 'C' },
  ] : [];

  const reserved: { x: number; z: number; r: number }[] = capSpots.map((c) => ({ x: c.x, z: c.z, r: 16 }));
  // зоны спавна команд
  if (cfg.mode === 'capture') {
    reserved.push({ x: 0, z: -half + 14, r: 26 }, { x: 0, z: half - 14, r: 26 });
  } else {
    reserved.push({ x: 0, z: 0, r: 8 });
  }
  const isFree = (x: number, z: number, r: number) => {
    for (const rv of reserved) if (Math.hypot(rv.x - x, rv.z - z) < rv.r + r) return false;
    for (const o of obstacles) {
      if (o.kind === 'wall') continue; // невидимые стены за краем арены — не блокируют застройку
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < o.r + r + 2.5) return false;
    }
    return true;
  };
  const place = (r: number, margin = 12, tries = 40): { x: number; z: number } | null => {
    for (let i = 0; i < tries; i++) {
      const x = (rnd() * 2 - 1) * (half - margin);
      const z = (rnd() * 2 - 1) * (half - margin);
      if (isFree(x, z, r)) return { x, z };
    }
    return null;
  };

  // ---- Периметр ----
  // ОПТИМИЗАЦИЯ: переиспользуем ~6 общих геометрий вместо 88 уникальных (меньше памяти и аплоадов)
  const isMount = cfg.biome === 'mountains';
  const segs = 22;
  const perimGeoCache = new Map<string, THREE.ConeGeometry>();
  const getPerimGeo = (h: number, r: number, seg: number) => {
    const key = `${Math.round(h)}_${Math.round(r * 2)}_${seg}`;
    let g = perimGeoCache.get(key);
    if (!g) {
      g = new THREE.ConeGeometry(r, h, seg);
      perimGeoCache.set(key, g);
      disposables.push(g);
    }
    return g;
  };
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const coords: [number, number][] = [
      [-half + t * ARENA_SIZE, -half - 6],
      [-half + t * ARENA_SIZE, half + 6],
      [-half - 6, -half + t * ARENA_SIZE],
      [half + 6, -half + t * ARENA_SIZE],
    ];
    for (const [x, z] of coords) {
      const h = (isMount ? 22 : 9) + rnd() * (isMount ? 18 : 6);
      const r = ARENA_SIZE / segs * 0.75 + rnd() * 3;
      const segN = 6 + Math.floor(rnd() * 3);
      const geo = getPerimGeo(h, r, segN);
      const m = new THREE.Mesh(geo, isMount ? rockMat : hillMat);
      m.position.set(x + (rnd() - 0.5) * 4, h / 2 - 1, z + (rnd() - 0.5) * 4);
      m.rotation.y = rnd() * Math.PI;
      // периметр за краем арены: тени выключены — они всё равно вне shadow-камеры и только грузят pass
      m.castShadow = false;
      m.receiveShadow = false;
      freezeStatic(m);
      scene.add(m);
    }
  }
  // невидимые стены арены
  const wallMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(wallMat);
  for (const [x, z, w, d] of [
    [0, -half - 2, ARENA_SIZE + 20, 4],
    [0, half + 2, ARENA_SIZE + 20, 4],
    [-half - 2, 0, 4, ARENA_SIZE + 20],
    [half + 2, 0, 4, ARENA_SIZE + 20],
  ]) {
    const m = new THREE.Mesh(boxGeo, wallMat);
    m.scale.set(w, 6, d);
    m.position.y = 3;
    const wrap = new THREE.Group();
    wrap.add(m);
    addBox('wall', x, z, w, d, 6, wrap, 1e9, false);
    minimapObstacles.pop();
  }

  // ---- Дороги (сетка между кварталами) ----
  const roadCount = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < roadCount; i++) {
    const vertical = rnd() > 0.5;
    const off = (rnd() * 2 - 1) * half * 0.6;
    const geo = new THREE.PlaneGeometry(vertical ? 7 : ARENA_SIZE, vertical ? ARENA_SIZE : 7);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, roadMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(vertical ? off : 0, 0.03, vertical ? 0 : off);
    m.receiveShadow = true;
    freezeStatic(m);
    scene.add(m);
  }

  // ---- Кварталы укрытий: дома, ангары, доты, бетон ----
  const winMatShared = new THREE.MeshStandardMaterial({ color: 0x0d1418, emissive: env.darkFactor > 0.05 ? 0xffc870 : 0x000000, emissiveIntensity: env.darkFactor * 1.4, roughness: 0.3 });
  disposables.push(winMatShared);
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.95 });
  disposables.push(concreteMat);
  // рыжая крыша ангара — чтобы отличался от обычных домов издалека
  const hangarRoofMat = new THREE.MeshStandardMaterial({ color: 0x8a4f36, roughness: 0.85 });
  disposables.push(hangarRoofMat);

  const makeHouse = (w: number, d: number, h: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo, buildingMat);
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.6, 0.5, d + 0.6);
    roof.position.y = h + 0.25;
    roof.castShadow = true;
    g.add(roof);
    // окна — было до ~24 мешей (draw calls) на дом, мержим в один
    const rows = Math.max(1, Math.floor(h / 2.6));
    const cols = Math.max(1, Math.floor(w / 3));
    const winParts: THREE.BufferGeometry[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        for (const side of [-1, 1]) {
          winParts.push(xg(boxGeo, -w / 2 + (c + 0.5) * (w / cols), 1.6 + r * 2.6, side * (d / 2 + 0.05), 0, 1.2, 1.4, 0.2));
        }
      }
    const wins = mergedMesh(winParts, winMatShared, disposables);
    if (wins) g.add(wins);
    return g;
  };
  const makeHangar = (w: number, d: number, h: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo, buildingMat);
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(boxGeo, hangarRoofMat);
    roof.scale.set(w + 1, 0.6, d + 1);
    roof.position.y = h + 0.3;
    roof.castShadow = true;
    g.add(roof);
    // ворота — тёмная ниша спереди
    const door = new THREE.Mesh(boxGeo, winMatShared);
    door.scale.set(w * 0.6, h * 0.7, 0.3);
    door.position.set(0, h * 0.35, d / 2 + 0.1);
    g.add(door);
    return g;
  };
  const makeBunker = (w: number, d: number, h: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo, concreteMat);
    body.scale.set(w, h, d);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const slab = new THREE.Mesh(boxGeo, barrierMat);
    slab.scale.set(w + 0.8, 0.5, d + 0.8);
    slab.position.y = h + 0.25;
    slab.castShadow = true;
    g.add(slab);
    // амбразура
    const slit = new THREE.Mesh(boxGeo, winMatShared);
    slit.scale.set(w * 0.7, 0.4, 0.3);
    slit.position.set(0, h * 0.65, d / 2 + 0.1);
    g.add(slit);
    return g;
  };
  const makeConcrete = (s: number) => {
    const g = new THREE.Group();
    const n = 1 + Math.floor(rnd() * 2);
    // мелкий бетон: тени не видно, в shadow-pass не участвуем
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < n; k++) {
      parts.push(xg(boxGeo, (rnd() - 0.5) * s, s * 0.35 + (k > 0 ? s * 0.7 : 0), (rnd() - 0.5) * s, (rnd() - 0.5) * 0.4, s, s * 0.7, s));
    }
    const m = mergedMesh(parts, concreteMat, disposables, { receive: true });
    if (m) g.add(m);
    return g;
  };

  // квартальная застройка: 4 квартала по углам + хаотичный центр
  // даёт коридоры и укрытия от прямого прострела через всю карту
  const quarters = [
    { x: -half * 0.52, z: -half * 0.52 },
    { x: half * 0.52, z: -half * 0.52 },
    { x: -half * 0.52, z: half * 0.52 },
    { x: half * 0.52, z: half * 0.52 },
  ];
  const tryPlaceNear = (cx: number, cz: number, spread: number, r: number): { x: number; z: number } | null => {
    for (let i = 0; i < 30; i++) {
      const x = cx + (rnd() * 2 - 1) * spread;
      const z = cz + (rnd() * 2 - 1) * spread;
      if (Math.abs(x) > half - 12 || Math.abs(z) > half - 12) continue;
      if (isFree(x, z, r)) return { x, z };
    }
    return place(r);
  };

  for (const q of quarters) {
    // 1-2 дома в квартале
    const houses = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < houses; i++) {
      const w = 8 + rnd() * 6;
      const d = 8 + rnd() * 6;
      const h = 5 + rnd() * 5;
      const pos = tryPlaceNear(q.x, q.z, 22, Math.hypot(w, d) / 2);
      if (!pos) continue;
      addBox('building', pos.x, pos.z, w, d, h, makeHouse(w, d, h), 900 + h * 60, true);
    }
    // 0-1 ангар между кварталами
    if (rnd() > 0.4) {
      const w = 16 + rnd() * 6;
      const d = 10 + rnd() * 4;
      const h = 5.5 + rnd() * 1.5;
      const pos = tryPlaceNear(q.x * 0.55, q.z * 0.55, 26, Math.hypot(w, d) / 2);
      if (pos) addBox('hangar', pos.x, pos.z, w, d, h, makeHangar(w, d, h), 1500, true);
    }
    // дот — низкий, прочный, идеален для hull-down
    {
      const w = 6 + rnd() * 2;
      const d = 6 + rnd() * 2;
      const h = 2.6 + rnd() * 0.6;
      const pos = tryPlaceNear(q.x, q.z, 28, Math.hypot(w, d) / 2);
      if (pos) addBox('bunker', pos.x, pos.z, w, d, h, makeBunker(w, d, h), 2500, true);
    }
    // 2-3 бетонных блока вокруг
    for (let i = 0; i < 3; i++) {
      const s = 2.6 + rnd() * 1.2;
      const pos = tryPlaceNear(q.x, q.z, 30, s);
      if (!pos) continue;
      addBox('concrete', pos.x, pos.z, s * 1.3, s * 1.3, s * 0.7, makeConcrete(s), 500, true);
    }
  }

  // добрасываем одиночные дома в центре для баланса
  const extraHouses = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < extraHouses; i++) {
    const w = 8 + rnd() * 9;
    const d = 8 + rnd() * 9;
    const h = 5 + rnd() * 6;
    const pos = place(Math.hypot(w, d) / 2);
    if (!pos) continue;
    addBox('building', pos.x, pos.z, w, d, h, makeHouse(w, d, h), 900 + h * 60, true);
  }

  // ---- Барьеры (удлинённые, для перекрытия прострелов) ----
  for (let i = 0; i < 18; i++) {
    const horizontal = rnd() > 0.5;
    const w = horizontal ? 7 + rnd() * 5 : 1.6;
    const d = horizontal ? 1.6 : 7 + rnd() * 5;
    const pos = place(Math.hypot(w, d) / 2, 10);
    if (!pos) continue;
    const g = new THREE.Group();
    const m = new THREE.Mesh(boxGeo, barrierMat);
    m.scale.set(w, 2.2, d);
    m.position.y = 1.1;
    m.castShadow = false; // низкий барьер: тени почти не видно, экономим shadow-pass
    m.receiveShadow = true;
    g.add(m);
    addBox('barrier', pos.x, pos.z, w, d, 2.2, g, 320, true);
  }

  // ---- Ящики ----
  for (let i = 0; i < 22; i++) {
    const s = 2.2 + rnd() * 1.6;
    const pos = place(s, 10);
    if (!pos) continue;
    const g = new THREE.Group();
    const n = 1 + Math.floor(rnd() * 3);
    const crateParts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < n; k++) {
      crateParts.push(xg(boxGeo, (rnd() - 0.5) * s * 0.4, s * 0.4 + k * s * 0.8, (rnd() - 0.5) * s * 0.4, rnd() * 0.5, s, s * 0.8, s));
    }
    const cm = mergedMesh(crateParts, crateMat, disposables);
    if (cm) {
      cm.receiveShadow = true;
      g.add(cm);
    }
    addBox('crate', pos.x, pos.z, s * 1.2, s * 1.2, s, g, 120, true);
  }

  // ---- Скалы (масштабировано под 210) ----
  // Геометрии квантуем по 0.5м и переиспользуем — было по уникальной на каждую скалу
  const rockGeoCache = new Map<number, THREE.DodecahedronGeometry>();
  const getRockGeo = (r: number) => {
    const key = Math.round(r * 2) / 2;
    let geo = rockGeoCache.get(key);
    if (!geo) {
      geo = new THREE.DodecahedronGeometry(key, 0);
      rockGeoCache.set(key, geo);
      disposables.push(geo);
    }
    return { geo, key };
  };
  const rockCount = cfg.biome === 'mountains' ? 28 : cfg.biome === 'desert' ? 18 : 12;
  for (let i = 0; i < rockCount; i++) {
    const r = 2.5 + rnd() * 4;
    const pos = place(r, 10);
    if (!pos) continue;
    const { geo, key } = getRockGeo(r);
    const m = new THREE.Mesh(geo, rockMat);
    // компенсируем квантование масштабом
    m.scale.set(r / key, (r / key) * (0.7 + rnd() * 0.5), r / key);
    m.position.y = r * 0.45;
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.castShadow = true;
    m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    addCircle('rock', pos.x, pos.z, r * 0.9, r, g);
  }

  // ---- Холмы внутри карты ----
  const hillCount = cfg.biome === 'mountains' ? 8 : 4;
  for (let i = 0; i < hillCount; i++) {
    const r = 7 + rnd() * 6;
    const pos = place(r, 16);
    if (!pos) continue;
    const h = 4 + rnd() * 5;
    const geo = new THREE.ConeGeometry(r, h, 8);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, hillMat);
    m.position.y = h / 2 - 0.3;
    m.castShadow = true;
    m.receiveShadow = true;
    const g = new THREE.Group();
    g.add(m);
    addCircle('hill', pos.x, pos.z, r * 0.8, h, g);
  }

  // ---- Деревья ----
  const treeCount = Math.floor(48 * p.treeDensity);
  const treeGeo = cfg.biome === 'winter' || cfg.biome === 'forest' ? new THREE.ConeGeometry(2.2, 7, 7) : new THREE.SphereGeometry(2.4, 7, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
  disposables.push(treeGeo, trunkGeo);
  for (let i = 0; i < treeCount; i++) {
    const pos = place(1.2, 8, 20);
    if (!pos) continue;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = false; // тонкий ствол тени почти не даёт, а draw в shadow-pass стоит
    g.add(trunk);
    const s = 0.8 + rnd() * 0.6;
    const crown = new THREE.Mesh(treeGeo, treeMat);
    crown.position.y = cfg.biome === 'winter' || cfg.biome === 'forest' ? 3 + 3.5 * s : 4.5;
    crown.scale.setScalar(s);
    crown.castShadow = true;
    g.add(crown);
    addCircle('tree', pos.x, pos.z, 0.7, 7, g, false);
  }

  // ---- Фонари (уличное освещение для тёмного времени) ----
  const lamps: Lamp[] = [];
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.8, metalness: 0.4 });
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.24, 6.5, 8);
    const armGeo = new THREE.BoxGeometry(1.6, 0.15, 0.15);
    const headGeo = new THREE.SphereGeometry(0.35, 10, 8);
    const groundGeo = new THREE.CircleGeometry(9, 20);
    disposables.push(poleMat, poleGeo, armGeo, headGeo, groundGeo);
    // радиальная текстура свечения (спрайт) — дешёвый bloom без света
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d')!;
    const grad = gctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,220,150,1)');
    grad.addColorStop(0.35, 'rgba(255,190,110,0.55)');
    grad.addColorStop(1, 'rgba(255,180,100,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    disposables.push(glowTex);
    // ОПТИМИЗАЦИЯ: общие материалы на все фонари (было 3 материала на фонарь).
    // Яркость одинакова для всех — нет смысла дублировать.
    const lampHeadMat = new THREE.MeshStandardMaterial({
      color: 0x443a28,
      emissive: 0xffc37a,
      emissiveIntensity: 0.15 + env.darkFactor * 2.6,
      roughness: 0.4,
    });
    const lampGlowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      opacity: env.darkFactor * 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lampGroundMat = new THREE.MeshBasicMaterial({
      color: 0xffbe78,
      transparent: true,
      opacity: env.darkFactor * 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    disposables.push(lampHeadMat, lampGlowMat, lampGroundMat);

    const addLamp = (x: number, z: number) => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 3.25;
      pole.castShadow = false; // ОПТИМИЗАЦИЯ: тонкий столб не даёт видимой тени ночью
      g.add(pole);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(0.6, 6.4, 0);
      arm.castShadow = false;
      g.add(arm);
      const head = new THREE.Mesh(headGeo, lampHeadMat);
      head.position.set(1.3, 6.25, 0);
      g.add(head);
      // спрайт-гало вокруг лампы
      const glow = new THREE.Sprite(lampGlowMat);
      glow.scale.set(7, 7, 1);
      glow.position.set(1.3, 6.2, 0);
      glow.visible = env.darkFactor > 0.05;
      g.add(glow);
      // пятно света на земле (фейк, без стоимости света)
      const groundDisc = new THREE.Mesh(groundGeo, lampGroundMat);
      groundDisc.rotation.x = -Math.PI / 2;
      groundDisc.position.set(1.3, 0.05, 0);
      g.add(groundDisc);
      // настоящий свет — только при темноте, без теней, с ограниченной дальностью
      const light = new THREE.PointLight(0xffc37a, env.darkFactor * 60, 32, 1.8);
      light.position.set(1.3, 6.0, 0);
      light.visible = env.darkFactor > LIGHTS_DARK_THRESHOLD;
      g.add(light);
      // h=1.5: тонкий столб не должен считаться укрытием для ИИ (findCover требует h>=2.5)
      addCircle('lamp', x, z, 0.6, 1.5, g, false);
      minimapObstacles.pop(); // фонари не засоряют миникарту
      lamps.push({ x, z, light, headMat: lampHeadMat, glow, ground: groundDisc, baseIntensity: 60, phase: rnd() * Math.PI * 2 });
    };

    // 1) по одному фонарю у каждой точки захвата (сбоку, чтобы не мешал)
    for (const c of capSpots) {
      const cand = [
        { x: c.x + 13.5, z: c.z + 4 },
        { x: c.x - 13.5, z: c.z - 4 },
      ];
      for (const pt of cand) {
        if (Math.abs(pt.x) < half - 6 && Math.abs(pt.z) < half - 6 && isFree(pt.x, pt.z, 1.2)) {
          addLamp(pt.x, pt.z);
          break;
        }
      }
    }
    // 2) остальные — случайно по карте (вдоль дорог и кварталов)
    const lampTarget = 10;
    for (let i = lamps.length; i < lampTarget; i++) {
      const pos = place(1.5, 10, 50);
      if (!pos) continue;
      addLamp(pos.x, pos.z);
    }
  }

  // ---- Декоративные воронки ----
  const craterGeo = new THREE.CircleGeometry(1, 14);
  disposables.push(craterGeo);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(craterGeo, craterMat);
    m.rotation.x = -Math.PI / 2;
    const s = 2 + rnd() * 3;
    m.scale.set(s, s * (0.7 + rnd() * 0.5), 1);
    m.position.set((rnd() * 2 - 1) * (half - 8), 0.02, (rnd() * 2 - 1) * (half - 8));
    freezeStatic(m);
    scene.add(m);
  }

  // ---- Точки захвата ----
  const capPoints: CapPoint[] = [];
  capSpots.forEach((c, i) => {
    const radius = 11;
    const ringGeo = new THREE.RingGeometry(radius - 0.6, radius, 48);
    const fillGeo = new THREE.CircleGeometry(radius - 0.7, 48);
    const beaconGeo = new THREE.CylinderGeometry(0.5, 1.2, 60, 8, 1, true);
    disposables.push(ringGeo, fillGeo, beaconGeo);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    disposables.push(ringMat, fillMat, beaconMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(c.x, 0.06, c.z);
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(c.x, 0.05, c.z);
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(c.x, 30, c.z);
    const light = new THREE.PointLight(0xffffff, 10 + env.darkFactor * 35, 40, 1.6);
    light.position.set(c.x, 6, c.z);
    const label = letterSprite(c.letter, disposables);
    label.position.set(c.x, 12, c.z);
    // трансформы точек статичны (пульсация — только материалами), замораживаем
    for (const o of [ring, fill, beacon, light, label]) {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    }
    scene.add(ring, fill, beacon, light, label);
    capPoints.push({ id: i, letter: c.letter, x: c.x, z: c.z, radius, owner: -1, progress: 0, capturing: -1, contested: false, ring, beacon, fill, light, label, blockedTimer: 0 });
  });

  // ---- Пикапы: для deathmatch — упор на ХП / урон 10с / скорость 10с ----
  const pickups: Pickup[] = [];
  const types: PickupType['id'][] =
    cfg.mode === 'deathmatch'
      ? ['repair', 'repair', 'repair', 'repair', 'damage', 'damage', 'damage', 'damage', 'speed', 'speed', 'speed', 'speed']
      : ['repair', 'ammo', 'speed', 'damage', 'repair', 'ammo', 'speed', 'damage'];
  types.forEach((tid, i) => {
    const pos = place(2, 14, 60);
    if (!pos) return;
    const type = PICKUP_TYPES[tid];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 });
    disposables.push(mat);
    let geo: THREE.BufferGeometry;
    if (tid === 'repair') {
      // крест — аптечка / ремкомплект
      geo = new THREE.BoxGeometry(0.5, 1.6, 0.5);
      const m1 = new THREE.Mesh(geo, mat);
      const m2 = new THREE.Mesh(geo, mat);
      m2.rotation.z = Math.PI / 2;
      g.add(m1, m2);
    } else if (tid === 'speed') {
      // стрелка-форсаж
      geo = new THREE.ConeGeometry(0.8, 1.8, 4);
      const m1 = new THREE.Mesh(geo, mat);
      m1.rotation.x = Math.PI / 2;
      g.add(m1);
    } else if (tid === 'damage') {
      // кристалл урона
      geo = new THREE.OctahedronGeometry(1, 0);
      g.add(new THREE.Mesh(geo, mat));
    } else {
      geo = new THREE.BoxGeometry(1.4, 1.0, 1.0);
      g.add(new THREE.Mesh(geo, mat));
    }
    disposables.push(geo);
    const baseGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.15, 20);
    const baseMat = new THREE.MeshBasicMaterial({ color: type.color, transparent: true, opacity: 0.5 });
    disposables.push(baseGeo, baseMat);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -1.1;
    g.add(base);
    // световой столб — видно издалека на большой карте и за укрытиями
    const beamGeo = new THREE.CylinderGeometry(1.2, 1.5, 22, 8, 1, true);
    disposables.push(beamGeo);
    const beamMat = new THREE.MeshBasicMaterial({ color: type.color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    disposables.push(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 10;
    g.add(beam);
    g.scale.setScalar(1.4);
    g.position.set(pos.x, 1.6, pos.z);
    // группа пикапа анимируется (вращение/парение) — динамическая,
    // а дети относительно неё статичны — замораживаем их
    for (const ch of g.children) freezeStatic(ch);
    scene.add(g);
    pickups.push({ id: i, type, x: pos.x, z: pos.z, active: true, respawnIn: 0, mesh: g });
  });

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  return { obstacles, pickups, capPoints, lamps, env, groundColor: new THREE.Color(p.ground), half, minimapObstacles, dispose };
}
