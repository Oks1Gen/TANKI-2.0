import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  BattleConfig, BattleResult, EffectiveStats, ShellType, SHELLS, SHELL_ORDER, TankId, TANKS, TankSpec, Team, computeStats,
  DURATION_SECONDS, BOT_NAMES, UpgradeId, BOOST_DURATION, BOOST_DAMAGE_MUL, BOOST_SPEED_MUL,
  PICKUP_RESPAWN_DM, PICKUP_RESPAWN_DEFAULT, BOT_DIFFICULTY_SPECS,
} from './config';
import { buildTank, TankModel, wreckify, setBeamOpacity, disposeTankModel } from './tankModel';
import { buildWorld, World, Obstacle, CapPoint, Pickup, mulberry, freezeStatic } from './world';
import { ParticleSystem, DebrisSystem, TrackMarks, WeatherSystem } from './effects';
import { audio } from './audio';
import { loadSettings, Settings } from './settings';

// ============ Типы состояния ============
interface Module {
  hp: number; // 0..1
  broken: boolean;
  repair: number;
}

export interface Tank {
  id: number;
  name: string;
  isPlayer: boolean;
  team: Team;
  spec: TankSpec;
  stats: EffectiveStats;
  model: TankModel;
  hitbox: THREE.Mesh;
  x: number;
  z: number;
  yaw: number;
  turretYaw: number;
  pitch: number;
  vel: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  wreck: boolean;
  reload: number;
  reloadTotal: number;
  clip: number;
  shell: ShellType;
  ammo: Record<ShellType, number>;
  modules: { gun: Module; engine: Module; track: Module };
  invuln: number;
  respawnTimer: number;
  boostSpeed: number;
  boostDamage: number;
  throttle: number;
  steer: number;
  trackDist: number;
  capBlocked: number;
  lastHitTime: number;
  smokeTimer: number;
  kills: number;
  marker: THREE.Sprite | null;
  markerCtx: CanvasRenderingContext2D | null;
  markerTex: THREE.CanvasTexture | null;
  markerDirty: boolean;
  ai: {
    skill: number;
    target: Tank | null;
    retarget: number;
    state: 'engage' | 'cover' | 'objective' | 'wander';
    stateTimer: number;
    moveTarget: { x: number; z: number } | null;
    strafeDir: number;
    stuck: number;
    unstick: number;
    aimError: { x: number; z: number };
    errorTimer: number;
    objective: CapPoint | null;
    think: number; // троттлинг дорогих решений ИИ
    los: boolean; // кэшированная видимость цели
  } | null;
}

interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: Tank;
  shell: ShellType;
  damage: number;
  mesh: THREE.Mesh;
  life: number;
  light: THREE.PointLight | null;
}

export interface Notification {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'warn' | 'kill';
  time: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnIn: number;
  reload: number; // 0..1 готовность
  reloadLeft: number;
  clip: number;
  magazine: number;
  shell: ShellType;
  ammo: Record<ShellType, number>;
  modules: { gun: number; engine: number; track: number; gunBroken: boolean; engineBroken: boolean; trackBroken: boolean };
  time: number;
  timeLeft: number;
  mode: BattleConfig['mode'];
  score: { blue: number; red: number };
  enemiesAlive: number;
  alliesAlive: number;
  enemiesTotal: number;
  points: { letter: string; owner: number; progress: number; capturing: number; contested: boolean; x: number; z: number }[];
  notifications: Notification[];
  killfeed: { id: number; text: string; time: number }[];
  damageFlash: number;
  damageDir: number; // угол относительно камеры
  boosts: { speed: number; damage: number };
  speedKmh: number;
  minimap: {
    player: { x: number; z: number; yaw: number; turretYaw: number };
    tanks: { x: number; z: number; team: number; alive: boolean }[];
    pickups: { x: number; z: number; type: string; active: boolean }[];
    /** разрушенные препятствия — рисуем тёмным поверх статики */
    destroyed: { x: number; z: number; w: number; d: number }[];
  };
  canFire: boolean;
  aimDistance: number;
  inPoint: string | null;
  invuln: number;
  pointerLocked: boolean;
  hitMarker: number;
  kills: number;
}

export interface EngineCallbacks {
  onHud: (s: HudSnapshot) => void;
  onEnd: (r: BattleResult) => void;
  onPause: () => void;
  onReady: () => void;
}

const G = 9.8;
const TEAM_COLORS = { blue: '#4aa3ff', red: '#ff5a5a' };

function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function ballisticPitch(v: number, d: number, h: number) {
  const disc = v * v * v * v - G * (G * d * d + 2 * h * v * v);
  if (disc < 0 || d < 0.01) return Math.PI / 4;
  return Math.atan((v * v - Math.sqrt(disc)) / (G * d));
}

export class GameEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private flashPool: { light: THREE.PointLight; life: number; max: number }[] = [];
  private flashCursor = 0;
  world!: World;
  cfg: BattleConfig;
  tanks: Tank[] = [];
  player!: Tank;
  projectiles: Projectile[] = [];
  particles: ParticleSystem;
  debris: DebrisSystem;
  tracks: TrackMarks;
  weather: WeatherSystem | null = null;
  cb: EngineCallbacks;
  private raf = 0;
  private last = 0;
  time = 0;
  timeLeft = 0;
  score = { blue: 0, red: 0 };
  private scoreAcc = 0;
  paused = false;
  ended = false;
  private endTimer = -1;
  private keys = new Set<string>();
  private mouseDown = false;
  private camYaw = 0;
  private camPitch = 0;
  private camShake = 0;
  private camRecoil = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private aimPoint = new THREE.Vector3();
  private aimDistance = 100;
  private raycaster = new THREE.Raycaster();
  private notifications: Notification[] = [];
  private killfeed: { id: number; text: string; time: number }[] = [];
  private nid = 1;
  private damageFlash = 0;
  private damageDir = 0;
  private hitMarker = 0;
  private hudTimer = 0;
  private stats = { kills: 0, damage: 0, shots: 0, hits: 0, captures: 0, timeAlive: 0 };
  private lightningTimer = 5;
  private lightningFlash = 0;
  private hemiBase = 1;
  private pointerLocked = false;
  private projGeo = new THREE.SphereGeometry(0.22, 6, 6);
  private tracerGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.5, 5);
  private shellMats: Record<ShellType, THREE.MeshBasicMaterial>;
  private canvas: HTMLCanvasElement;
  private resizeObs: ResizeObserver;
  private disposed = false;
  private finished = false;
  // переиспользуемые векторы для камеры — без аллокаций в кадре
  private tmpPivot = new THREE.Vector3();
  private tmpBack = new THREE.Vector3();
  private tmpDesired = new THREE.Vector3();
  private tmpToCam = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private rubbleDisposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  private wreckSmoke: { x: number; z: number; t: number }[] = [];
  private engineThrottle = 0;
  private firstFrameDone = false;
  // ---- оптимизация perf: адаптивное качество + троттлинг дорогих проходов ----
  private lowEnd = false;
  private usePost = true;
  private settings: Settings = loadSettings();
  private baseFov = 62;
  private frameAcc = 0;
  private frameCount = 0;
  private degraded = 0;
  private camRayTimer = 0;
  private camBlockedDist = -1; // кэш дистанции до препятствия за камерой
  private aimTimer = 0;
  private aimTargets: THREE.Object3D[] = [];
  private aimTargetsDirty = true;
  private audioTimer = 0;

  constructor(canvas: HTMLCanvasElement, cfg: BattleConfig, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.cb = cb;
    // Эвристика слабого железа: мобильные / мало ядер / встройка Intel-UHD / софтверный GL.
    // GPU смотрим на отдельном временном canvas — основной контекст создаём уже с нужным AA.
    try {
      const ua = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgent || '';
      const mobile = /Android|iPhone|iPad|Mobile/i.test(ua) || !!((navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile);
      const cores = (navigator as Navigator).hardwareConcurrency || 8;
      const smallScreen = Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 700;
      this.lowEnd = mobile || cores <= 4 || smallScreen;
      try {
        if (localStorage.getItem('steel-assault-lowfx') === '1') this.lowEnd = true;
      } catch { /* */ }
      if (!this.lowEnd) {
        try {
          const tmp = document.createElement('canvas');
          const gl = tmp.getContext('webgl2') as unknown as (WebGLRenderingContext & { RENDERER: number }) | null;
          if (gl) {
            let gpuName = '';
            try {
              const dbg = gl.getExtension('WEBGL_debug_renderer_info') as unknown as { UNMASKED_RENDERER_WEBGL: number } | null;
              gpuName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl.getParameter(gl.RENDERER) as string) || '');
            } catch { /* */ }
            if (/SwiftShader|llvmpipe|Software|Basic Render|Mali|Adreno|PowerVR|VideoCore|Intel[^)]*?\bHD\b|Intel[^)]*?UHD/i.test(gpuName)) {
              this.lowEnd = true;
            }
          }
        } catch { /* */ }
      }
    } catch { this.lowEnd = false; }
    // явная настройка качества перекрывает эвристику
    try {
      this.settings = loadSettings();
      if (this.settings.quality === 'low') this.lowEnd = true;
      else if (this.settings.quality === 'high') this.lowEnd = false;
      this.baseFov = this.settings.fov;
    } catch { /* */ }
    const aa = !this.lowEnd;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: aa, powerPreference: 'high-performance' });
    } catch (e) {
      throw new Error('WebGL недоступен: ' + (e instanceof Error ? e.message : String(e)));
    }
    if (!this.renderer.getContext()) throw new Error('Не удалось получить WebGL-контекст');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowEnd ? 1 : 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.lowEnd ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.5, 700);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    // на слабом железе пост-эффект сразу выключен — это один из главных пожирателей FPS
    this.usePost = !this.lowEnd;
    const particleCap = this.lowEnd ? 1600 : 2500;
    this.particles = new ParticleSystem(particleCap);
    this.scene.add(this.particles.points);
    this.debris = new DebrisSystem(this.scene, this.lowEnd ? 36 : 50);
    this.tracks = new TrackMarks(this.scene, this.lowEnd ? 220 : 350);
    this.shellMats = {
      AP: new THREE.MeshBasicMaterial({ color: SHELLS.AP.color }),
      HEAT: new THREE.MeshBasicMaterial({ color: SHELLS.HEAT.color }),
      HE: new THREE.MeshBasicMaterial({ color: SHELLS.HE.color }),
    };
    this.resizeObs = new ResizeObserver(() => {
      // дебаунс — пересоздание таргетов композера дорого
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.resize(), 120);
    });
    this.resizeObs.observe(canvas.parentElement ?? canvas);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.resize();
    this.init();
  }

  private onContextLost = (e: Event) => {
    try {
      e.preventDefault();
    } catch {
      /* */
    }
    this.notify('Потерян WebGL-контекст. Перезапустите бой.', 'bad');
  };

  private resize() {
    if (this.disposed) return;
    const el = this.canvas.parentElement ?? this.canvas;
    const w = el.clientWidth || window.innerWidth || 800;
    const h = el.clientHeight || window.innerHeight || 600;
    if (w <= 0 || h <= 0) return;
    try {
      const cap = this.degraded >= 2 ? 0.8 : this.lowEnd || this.degraded >= 1 ? 1 : 1.25;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    } catch {
      /* */
    }
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Адаптивная деградация: если средний кадр > ~26мс — режем pixelRatio, bloom, тени
  private adaptQuality(dt: number) {
    this.frameAcc += dt;
    this.frameCount++;
    if (this.frameCount < 240) return;
    const avg = this.frameAcc / this.frameCount;
    this.frameAcc = 0;
    this.frameCount = 0;
    if (avg < 0.026 || this.degraded >= 2) return;
    this.degraded++;
    try {
      if (this.degraded === 1) {
        this.usePost = false;
        this.renderer.setPixelRatio(1);
        this.resize();
      } else if (this.degraded === 2) {
        this.usePost = false;
        this.renderer.setPixelRatio(0.8);
        this.resize();
        try { this.world.env.sun.castShadow = false; } catch { /* */ }
        try {
          this.renderer.shadowMap.enabled = false;
          // смена shadowMap.enabled требует перекомпиляции шейдеров, иначе висят старые defines
          this.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
            if (!mat || !(m as THREE.Mesh).isMesh) return;
            if (Array.isArray(mat)) mat.forEach((x) => { try { x.needsUpdate = true; } catch { /* */ } });
            else try { mat.needsUpdate = true; } catch { /* */ }
          });
        } catch { /* */ }
        try { localStorage.setItem('steel-assault-lowfx', '1'); } catch { /* */ }
      }
    } catch { /* */ }
  }

  // ================= Инициализация =================
  private init() {
    const seed = Math.floor(Math.random() * 1e9);
    this.world = buildWorld(this.scene, this.cfg, seed);
    this.hemiBase = this.world.env.hemi.intensity;
    this.weather = new WeatherSystem(this.scene, this.cfg.weather);
    this.timeLeft = this.cfg.mode === 'capture' ? DURATION_SECONDS[this.cfg.duration] : 0;

    // Игрок
    const up = this.cfg.upgrades;
    const pStats = computeStats(this.cfg.tank, up, this.cfg.goldUpgrade);
    this.player = this.createTank(0, 'Вы', true, 0, this.cfg.tank, pStats, this.cfg.camo);
    this.tanks.push(this.player);

    // Боты — характеристики зависят от выбранной сложности
    const rnd = mulberry(seed ^ 0x5bd1e995);
    const names = [...BOT_NAMES].sort(() => rnd() - 0.5);
    const total = this.cfg.bots + 1;
    const redCount = this.cfg.mode === 'capture' ? Math.ceil(total / 2) : this.cfg.bots;
    const ids: TankId[] = ['t34', 't100lt', 'e100'];
    const diff = BOT_DIFFICULTY_SPECS[this.cfg.botDifficulty ?? 'veteran'] ?? BOT_DIFFICULTY_SPECS.veteran;
    for (let i = 0; i < this.cfg.bots; i++) {
      const team: Team = this.cfg.mode === 'capture' ? (i < redCount ? 1 : 0) : 1;
      const tid = ids[Math.floor(rnd() * ids.length)];
      const lvl = diff.lvlMin + Math.floor(rnd() * (diff.lvlMax - diff.lvlMin + 1));
      const botUp = { gun: lvl, engine: lvl, armor: lvl, sight: lvl, ammo: lvl, suspension: lvl } as Record<UpgradeId, number>;
      const st = computeStats(tid, botUp, false);
      st.hp = Math.round(st.hp * diff.hpMul);
      st.damage = Math.round(st.damage * diff.damageMul);
      st.reload *= diff.reloadMul;
      const camo = this.cfg.biome === 'desert' ? 'desert' : this.cfg.biome === 'winter' ? 'winter' : this.cfg.biome === 'forest' ? 'forest' : 'base';
      const t = this.createTank(i + 1, names[i % names.length] + (i >= names.length ? '-' + (Math.floor(i / names.length) + 1) : ''), false, team, tid, st, camo);
      t.maxHp = st.hp;
      t.hp = st.hp;
      t.ai = { skill: diff.skillMin + rnd() * (diff.skillMax - diff.skillMin), target: null, retarget: rnd() * 2, state: 'wander', stateTimer: 0, moveTarget: null, strafeDir: rnd() > 0.5 ? 1 : -1, stuck: 0, unstick: 0, aimError: { x: 0, z: 0 }, errorTimer: 0, objective: null, think: rnd() * 0.2, los: false };
      this.tanks.push(t);
    }
    // Расстановка
    for (const t of this.tanks) this.spawnTank(t, true);

    // Освещение для тёмного времени (ночь/вечер/закат/сумерки/туман): фары + прожектора + bloom
    const dark = this.world.env.darkFactor;
    this.bloom.strength = 0.32 + dark * 0.28;
    // глубокой ночью солнце почти не светит — отключаем дорогой проход теней
    this.world.env.sun.castShadow = dark < 0.75;
    for (const t of this.tanks) this.applyTankLights(t);
    this.updateLightCulling();
    // пул вспышек выстрелов/взрывов — 3 переиспользуемых PointLight вместо десятков
    for (let i = 0; i < 3; i++) {
      const fl = new THREE.PointLight(0xffb060, 0, 48, 1.8);
      fl.visible = false;
      this.scene.add(fl);
      this.flashPool.push({ light: fl, life: 0, max: 1 });
    }
    if (dark > 0.35) {
      this.notify('Тёмное время: включены фонари и прожектора танков', 'info');
    }

    this.camYaw = this.player.yaw;
    this.player.turretYaw = this.player.yaw;
    if (this.cfg.mode === 'deathmatch') {
      this.notify('Бонусы на карте: ✚ ремонт, ◆ урон +50% на 10 с, ➤ форсаж на 10 с — ищите световые столбы', 'info');
      this.notify('Укрытия: дома, ангары с рыжей крышей, доты, бетонные блоки', 'info');
    }
    this.bindInput();
    audio.init();
    audio.startEngine();
    audio.startAmbience(this.cfg.weather);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private lightCullTimer = 0;

  private applyTankLights(t: Tank) {
    const dark = this.world.env.darkFactor;
    const on = dark > 0.35 && t.alive;
    const k = Math.max(0, Math.min(1, (dark - 0.35) / 0.65)); // 0..1 плавное включение
    for (const h of t.model.headlights) {
      h.visible = on;
      h.intensity = on ? (t.isPlayer ? 60 + 220 * k : 30 + 110 * k) : 0;
    }
    for (const c of t.model.headCones) {
      c.visible = on;
      setBeamOpacity(c, on ? 0.07 + 0.09 * k : 0);
    }
    t.model.lightMeshes.forEach((m) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.6 + 2.6 * k : 0.3));
  }

  // Дистанционный culling света: в шейдер попадают только ближние источники.
  // Спрайты/конусы/пятна остаются видимыми (дёшево), гасятся только реальные Spot/Point.
  // Жёсткий лимит: каждый SpotLight — это пер-фрагментная цена для ВСЕХ материалов,
  // поэтому ночью оставляем реальный свет только игроку + 3 ближайшим (остальные — фейк-конусы).
  private updateLightCulling() {
    const dark = this.world.env.darkFactor;
    if (dark <= 0.35) return;
    const px = this.player.x;
    const pz = this.player.z;
    // находим 3 ближайших живых бота
    let n1: Tank | null = null, n2: Tank | null = null, n3: Tank | null = null;
    let d1 = Infinity, d2 = Infinity, d3 = Infinity;
    for (const t of this.tanks) {
      if (t.isPlayer || !t.alive || t.model.group.visible === false) continue;
      const d2v = (t.x - px) * (t.x - px) + (t.z - pz) * (t.z - pz);
      if (d2v > 80 * 80) continue;
      if (d2v < d1) { d3 = d2; n3 = n2; d2 = d1; n2 = n1; d1 = d2v; n1 = t; }
      else if (d2v < d2) { d3 = d2; n3 = n2; d2 = d2v; n2 = t; }
      else if (d2v < d3) { d3 = d2v; n3 = t; }
    }
    for (const t of this.tanks) {
      if (!t.alive || t.model.group.visible === false) continue;
      const real = t.isPlayer || t === n1 || t === n2 || t === n3;
      for (const h of t.model.headlights) h.visible = real;
      // конус дешёвый — виден чуть дальше, чем реальный спот
      if (!real) {
        const d2v = (t.x - px) * (t.x - px) + (t.z - pz) * (t.z - pz);
        const coneNear = d2v < 110 * 110;
        for (const c of t.model.headCones) c.visible = coneNear;
      } else {
        for (const c of t.model.headCones) c.visible = true;
      }
    }
    // фонари: реальный свет только у 4 ближайших в радиусе 70м (без sort-аллокаций)
    const lamps = this.world.lamps;
    if (lamps.length > 0) {
      const scored: { i: number; d2: number }[] = [];
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        const d2v = (l.x - px) * (l.x - px) + (l.z - pz) * (l.z - pz);
        if (d2v < 70 * 70) scored.push({ i, d2: d2v });
      }
      scored.sort((a, b) => a.d2 - b.d2);
      const on = new Set<number>();
      for (let k = 0; k < Math.min(4, scored.length); k++) on.add(scored[k].i);
      for (let i = 0; i < lamps.length; i++) lamps[i].light.visible = on.has(i);
    }
  }

  private flash(x: number, y: number, z: number, power = 120, color = 0xffb060, dist = 48) {
    const dark = this.world.env.darkFactor;
    if (dark < 0.05) return; // днём вспышки не освещают
    const f = this.flashPool[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashPool.length;
    f.light.position.set(x, y, z);
    f.light.color.setHex(color);
    f.light.distance = dist;
    f.light.intensity = power * (0.35 + 0.65 * dark);
    f.light.visible = true;
    f.life = 0.22;
    f.max = 0.22;
  }

  private createTank(id: number, name: string, isPlayer: boolean, team: Team, tid: TankId, stats: EffectiveStats, camo: BattleConfig['camo']): Tank {
    const spec = TANKS[tid];
    // Реальные SpotLight-фар только у игрока: каждый спот — пер-фрагментная цена
    // для всех материалов. У ботов дешёвые фейк-конусы (видны так же).
    const model = buildTank(tid, camo, team, isPlayer);
    this.scene.add(model.group);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(spec.scale.width, spec.scale.height * 2.2, spec.scale.length), new THREE.MeshBasicMaterial({ visible: false }));
    hb.position.y = spec.scale.height * 1.1 + 0.4;
    hb.name = 'hitbox';
    model.group.add(hb);
    const t: Tank = {
      id, name, isPlayer, team, spec, stats, model, hitbox: hb,
      x: 0, z: 0, yaw: 0, turretYaw: 0, pitch: 0, vel: 0,
      hp: stats.hp, maxHp: stats.hp, alive: true, wreck: false,
      reload: 0, reloadTotal: stats.reload, clip: stats.magazine, shell: 'AP',
      ammo: { ...stats.ammo },
      modules: { gun: { hp: 1, broken: false, repair: 0 }, engine: { hp: 1, broken: false, repair: 0 }, track: { hp: 1, broken: false, repair: 0 } },
      invuln: 0, respawnTimer: 0, boostSpeed: 0, boostDamage: 0, throttle: 0, steer: 0, trackDist: 0, capBlocked: 0, lastHitTime: -10, smokeTimer: 0, kills: 0,
      marker: null, markerCtx: null, markerTex: null, markerDirty: true, ai: null,
    };
    if (!isPlayer) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      t.markerCtx = c.getContext('2d');
      t.markerTex = new THREE.CanvasTexture(c);
      const sm = new THREE.SpriteMaterial({ map: t.markerTex, transparent: true, depthTest: false, depthWrite: false });
      t.marker = new THREE.Sprite(sm);
      t.marker.scale.set(9, 2.25, 1);
      t.marker.renderOrder = 10;
      this.scene.add(t.marker);
    }
    return t;
  }

  private spawnTank(t: Tank, initial: boolean) {
    const half = this.world.half;
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      let x: number, z: number;
      if (this.cfg.mode === 'capture') {
        const side = t.team === 0 ? 1 : -1;
        x = (Math.random() * 2 - 1) * (half - 30);
        z = side * (half - 12 - Math.random() * 18);
      } else {
        x = (Math.random() * 2 - 1) * (half - 14);
        z = (Math.random() * 2 - 1) * (half - 14);
      }
      if (!this.isSpotFree(x, z, t.spec.radius + 2.5, t)) continue;
      // не слишком близко к врагам
      let minEnemy = 1e9;
      for (const o of this.tanks) {
        if (o === t || !o.alive) continue;
        const d = Math.hypot(o.x - x, o.z - z);
        if (this.isEnemy(t, o)) minEnemy = Math.min(minEnemy, d);
        if (d < 12) minEnemy = 0;
      }
      if (minEnemy < (this.cfg.mode === 'capture' ? 48 : 46) && i < 150) continue;
      t.x = x;
      t.z = z;
      found = true;
    }
    if (!found) {
      // запасной план: спиральный поиск свободной точки вокруг базы, а не слепой рандом
      const baseZ = t.team === 0 ? half - 15 : -half + 15;
      let placed = false;
      for (let r = 0; r < 40 && !placed; r += 4) {
        for (let a = 0; a < 8 && !placed; a++) {
          const x = Math.cos((a / 8) * Math.PI * 2) * r;
          const z = baseZ + Math.sin((a / 8) * Math.PI * 2) * r * 0.5;
          if (this.isSpotFree(x, z, t.spec.radius + 2.5, t)) {
            t.x = x;
            t.z = z;
            placed = true;
          }
        }
      }
      if (!placed) {
        t.x = (Math.random() * 2 - 1) * 20;
        t.z = baseZ;
      }
    }
    t.yaw = this.cfg.mode === 'capture' ? (t.team === 0 ? Math.PI : 0) : Math.atan2(-t.x, -t.z);
    t.turretYaw = t.yaw;
    t.vel = 0;
    t.hp = t.maxHp;
    t.alive = true;
    t.wreck = false;
    t.reload = 0;
    t.clip = t.stats.magazine;
    t.invuln = initial ? 0 : 4;
    t.boostDamage = 0;
    t.boostSpeed = 0;
    for (const m of Object.values(t.modules)) {
      m.hp = 1;
      m.broken = false;
      m.repair = 0;
    }
    if (!initial) {
      t.ammo = { ...t.stats.ammo };
    }
    t.model.group.visible = true;
    t.model.group.position.set(t.x, 0, t.z);
    t.markerDirty = true;
    if (t.marker) t.marker.visible = true;
    if (t.ai) {
      t.ai.target = null;
      t.ai.state = 'wander';
      t.ai.moveTarget = null;
      t.ai.think = Math.random() * 0.2;
      t.ai.los = false;
    }
    this.aimTargetsDirty = true;
    // после респауна заново включаем фары (wreckify их гасил)
    if (this.world) this.applyTankLights(t);
  }

  private isSpotFree(x: number, z: number, r: number, self: Tank | null) {
    if (Math.abs(x) > this.world.half - r || Math.abs(z) > this.world.half - r) return false;
    for (const o of this.world.obstacles) {
      if (o.kind === 'wall') {
        // стены — граница арены, для спавна их игнорим (кламп по half уже выше)
        continue;
      }
      if (!o.alive && !o.rubble) continue;
      if (o.shape === 'circle') {
        if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
      } else {
        const dx = Math.max(Math.abs(x - o.x) - o.hw, 0);
        const dz = Math.max(Math.abs(z - o.z) - o.hd, 0);
        if (Math.hypot(dx, dz) < r) return false;
      }
    }
    for (const t of this.tanks) {
      if (t === self) continue;
      if (!t.alive && !t.wreck) continue;
      if (Math.hypot(t.x - x, t.z - z) < t.spec.radius + r) return false;
    }
    return true;
  }

  // ================= Ввод =================
  private onKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (this.paused || this.ended) return;
    if (e.code === 'KeyQ') this.cycleShell(-1);
    if (e.code === 'KeyE') this.cycleShell(1);
    if (e.code === 'Digit1') this.setShell('AP');
    if (e.code === 'Digit2') this.setShell('HEAT');
    if (e.code === 'Digit3') this.setShell('HE');
    if (e.code === 'Escape') this.pause();
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseMove = (e: MouseEvent) => {
    if (this.paused || this.ended) return;
    if (!this.pointerLocked) return;
    const sens = 0.0022 * this.settings.sensitivity;
    // Мышь вверх (movementY < 0) — прицел и камера вверх: pitch растёт.
    // Галка «Инверсия мыши по вертикали» даёт обратное поведение.
    const dy = this.settings.invertY ? e.movementY : -e.movementY;
    this.camYaw -= e.movementX * sens;
    this.camPitch = clamp(this.camPitch + dy * sens * 0.8, -0.25, 0.65);
  };

  /** Живое применение настроек из паузы (чувствительность/звук/FOV сразу, качество — pixelRatio/bloom). */
  applySettings(s: Settings) {
    this.settings = s;
    this.baseFov = s.fov;
    try {
      audio.setVolume(s.volume);
    } catch { /* */ }
    const wantLow = s.quality === 'low' ? true : s.quality === 'high' ? false : this.lowEnd;
    // при Авто не дёргаем эвристику, только при явном выборе
    if (s.quality !== 'auto' && wantLow !== this.lowEnd) {
      this.lowEnd = wantLow;
      this.usePost = !this.lowEnd;
      try {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowEnd ? 1 : 1.25));
        this.resize();
      } catch { /* */ }
    }
  }
  private onMouseDown = (e: MouseEvent) => {
    if (this.paused || this.ended) return;
    if (!this.pointerLocked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.mouseDown = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  private onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked && !this.paused && !this.ended && this.firstFrameDone && this.time > 0.5) {
      this.pause();
    }
  };
  private onBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    // Alt-Tab / сворачивание: бой не должен идти без игрока
    if (!this.paused && !this.ended && this.firstFrameDone) this.pause();
  };
  private onVisibility = () => {
    if (document.hidden) {
      this.keys.clear();
      this.mouseDown = false;
      if (!this.paused && !this.ended && this.firstFrameDone) this.pause();
    }
  };

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* */
    }
  }

  private onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  private cycleShell(dir: number) {
    const i = SHELL_ORDER.indexOf(this.player.shell);
    this.setShell(SHELL_ORDER[(i + dir + 3) % 3]);
  }
  private setShell(s: ShellType) {
    if (this.player.shell === s) return;
    this.player.shell = s;
    audio.ui('click');
    this.notify(`Снаряд: ${SHELLS[s].name}`, 'info');
  }

  pause() {
    if (this.paused || this.ended) return;
    this.paused = true;
    audio.setPaused(true);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.cb.onPause();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    audio.setPaused(false);
    this.last = performance.now();
    this.requestLock();
  }

  // ================= Уведомления =================
  private notify(text: string, kind: Notification['kind'] = 'info') {
    this.notifications.push({ id: this.nid++, text, kind, time: this.time });
    if (this.notifications.length > 6) this.notifications.shift();
  }
  private feed(text: string) {
    this.killfeed.push({ id: this.nid++, text, time: this.time });
    if (this.killfeed.length > 5) this.killfeed.shift();
  }

  // ================= Главный цикл =================
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt >= 0) || !Number.isFinite(dt)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;
    if (!this.paused && !this.ended) {
      try {
        this.update(dt);
      } catch (e) {
        console.error('[engine] update failed', e);
      }
    } else if (this.ended && this.endTimer >= 0) {
      try {
        this.updateVisualOnly(dt);
      } catch (e) {
        console.error('[engine] visual update failed', e);
      }
    }
    try {
      this.updateCamera(this.paused ? 0 : dt);
    } catch (e) {
      console.error('[engine] camera failed', e);
    }
    try {
      // днём bloom почти не виден — рендерим напрямую, это дешевле композера.
      // Ночью bloom оставляем (фары/фонари), на слабом железе — никогда.
      const needPost = this.usePost && this.world.env.darkFactor > 0.3;
      if (needPost) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    } catch (e) {
      console.error('[engine] render failed', e);
    }
    try {
      if (!this.paused && !this.ended) this.adaptQuality(dt);
    } catch { /* */ }
    if (!this.firstFrameDone) {
      this.firstFrameDone = true;
      try {
        this.cb.onReady();
      } catch {
        /* */
      }
    }
    this.hudTimer += dt;
    if (this.hudTimer > 0.12) {
      this.hudTimer = 0;
      try {
        this.cb.onHud(this.snapshot());
      } catch {
        /* */
      }
    }
  };

  private updateVisualOnly(dt: number) {
    this.time += dt;
    this.particles.update(dt);
    this.debris.update(dt);
    this.weather?.update(dt, this.player.x, this.player.z, this.time);
    this.updateProjectiles(dt);
    this.endTimer -= dt;
    if (this.endTimer <= 0) {
      this.endTimer = -1;
      this.finish();
    }
  }

  private update(dt: number) {
    this.time += dt;
    if (this.player.alive) this.stats.timeAlive += dt;
    this.updatePlayerInput(dt);
    for (const t of this.tanks) {
      if (t.ai) this.updateBot(t, dt);
      this.updateTank(t, dt);
    }
    this.resolveTankCollisions();
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    if (this.cfg.mode === 'capture') this.updateCapture(dt);
    this.lightCullTimer -= dt;
    if (this.lightCullTimer <= 0) {
      this.lightCullTimer = 0.5;
      this.updateLightCulling();
    }
    this.updateEffectsAmbient(dt);
    this.particles.update(dt);
    this.debris.update(dt);
    this.weather?.update(dt, this.player.x, this.player.z, this.time);
    this.updateMarkers();
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 3);
    this.checkEnd(dt);
    // звук двигателя — setTargetAtTime каждый кадр плодит события, троттлим до 10 Гц
    this.audioTimer -= dt;
    if (this.audioTimer <= 0) {
      this.audioTimer = 0.1;
      const sp = Math.abs(this.player.vel) / this.player.stats.speed;
      audio.setEngine(this.engineThrottle, sp, this.player.alive);
    }
  }

  // ================= Игрок =================
  private updatePlayerInput(dt: number) {
    const p = this.player;
    const k = this.keys;
    let th = 0;
    let st = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) th += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) th -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) st += 1;
    if (k.has('KeyD') || k.has('ArrowRight')) st -= 1;
    // инверсия поворота при движении назад
    if (p.vel < -0.5 && th <= 0) st = -st;
    p.throttle = p.alive ? th : 0;
    p.steer = p.alive ? st : 0;
    this.engineThrottle += (Math.abs(th) - this.engineThrottle) * Math.min(1, dt * 4);
    // башня следует за камерой
    const target = this.camYaw;
    const d = angDiff(target, p.turretYaw);
    const rate = p.stats.turretTurn * (p.modules.gun.broken ? 0.5 : 1);
    p.turretYaw += clamp(d, -rate * dt, rate * dt);
    // наведение по точке прицела
    const dx = this.aimPoint.x - p.x;
    const dz = this.aimPoint.z - p.z;
    const dist = Math.hypot(dx, dz);
    const muzzleH = 2.2;
    p.pitch = clamp(ballisticPitch(p.stats.shellSpeed * SHELLS[p.shell].speedMul, Math.max(dist, 5), this.aimPoint.y - muzzleH), -0.1, 0.45);
    this.aimDistance = dist;
    const fireHeld = this.mouseDown || k.has('Space');
    if (fireHeld && p.alive) this.tryFire(p);
  }

  // ================= Танк: физика =================
  private updateTank(t: Tank, dt: number) {
    if (!t.alive) {
      if (this.cfg.mode === 'capture' && !t.wreck) {
        t.respawnTimer -= dt;
        if (t.respawnTimer <= 0) {
          this.spawnTank(t, false);
          if (t.isPlayer) this.notify('Вы вернулись в бой. Неуязвимость 4 с', 'good');
        }
      }
      return;
    }
    t.invuln = Math.max(0, t.invuln - dt);
    t.capBlocked = Math.max(0, t.capBlocked - dt);
    t.boostSpeed = Math.max(0, t.boostSpeed - dt);
    t.boostDamage = Math.max(0, t.boostDamage - dt);
    // модули
    for (const m of Object.values(t.modules)) {
      if (m.broken) {
        m.repair -= dt;
        if (m.repair <= 0) {
          m.broken = false;
          m.hp = 0.45;
        }
      } else if (m.hp < 1) m.hp = Math.min(1, m.hp + dt * 0.025);
    }
    // перезарядка
    if (t.reload > 0) {
      t.reload -= dt * (t.modules.gun.hp < 0.5 ? 0.75 : 1);
      if (t.reload <= 0) {
        t.reload = 0;
        if (t.clip <= 0) t.clip = t.stats.magazine;
      }
    }
    // мобильность
    const eng = t.modules.engine;
    const trk = t.modules.track;
    let speedMul = eng.broken ? 0.25 : eng.hp < 0.5 ? 0.7 : 1;
    if (trk.broken) speedMul *= 0.08;
    else if (trk.hp < 0.5) speedMul *= 0.6;
    if (t.boostSpeed > 0) speedMul *= BOOST_SPEED_MUL;
    const maxF = t.stats.speed * speedMul;
    const maxR = t.stats.reverseSpeed * speedMul;
    const accel = t.stats.accel * (eng.broken ? 0.4 : 1);
    const targetV = t.throttle > 0 ? maxF * t.throttle : t.throttle < 0 ? maxR * t.throttle : 0;
    if (Math.abs(targetV) > Math.abs(t.vel) && Math.sign(targetV) === Math.sign(t.vel || targetV)) {
      t.vel += clamp(targetV - t.vel, -accel * dt, accel * dt);
    } else {
      t.vel += clamp(targetV - t.vel, -accel * 2.2 * dt, accel * 2.2 * dt);
    }
    const turnMul = trk.broken ? 0.35 : 1;
    const turnRate = t.stats.hullTurn * turnMul * (0.55 + 0.45 * Math.min(1, Math.abs(t.vel) / 3 + 0.4));
    t.yaw += t.steer * turnRate * dt;
    const nx = t.x + Math.sin(t.yaw) * t.vel * dt;
    const nz = t.z + Math.cos(t.yaw) * t.vel * dt;
    const res = this.collideCircle(nx, nz, t.spec.radius * 0.85);
    if (res.hit) t.vel *= 0.4;
    t.x = res.x;
    t.z = res.z;
    // визуал
    const g = t.model.group;
    g.position.set(t.x, 0, t.z);
    g.rotation.y = t.yaw;
    const lean = clamp(-(t.throttle * accel) * 0.006, -0.03, 0.03);
    t.model.hull.rotation.x += (lean - t.model.hull.rotation.x) * Math.min(1, dt * 4);
    t.model.hull.rotation.z += (t.steer * Math.abs(t.vel) * 0.004 - t.model.hull.rotation.z) * Math.min(1, dt * 4);
    t.model.turret.rotation.y = angDiff(t.turretYaw, t.yaw);
    t.model.barrel.rotation.x += (-t.pitch - t.model.barrel.rotation.x) * Math.min(1, dt * 8);
    // катки
    const wr = t.spec.scale.height * 0.75 * 0.42;
    for (const w of t.model.wheels) w.rotation.x += (t.vel / wr) * dt;
    // следы и пыль
    t.trackDist += Math.abs(t.vel) * dt;
    if (t.trackDist > 1.3 && Math.abs(t.vel) > 0.5) {
      t.trackDist = 0;
      const tw = t.spec.scale.width * 0.4;
      const cx = Math.cos(t.yaw);
      const sx = Math.sin(t.yaw);
      this.tracks.stamp(t.x + cx * tw, t.z - sx * tw, t.yaw);
      this.tracks.stamp(t.x - cx * tw, t.z + sx * tw, t.yaw);
      const dustCol = this.cfg.biome === 'winter' ? 0xe8eef2 : this.cfg.biome === 'desert' ? 0xd8c090 : 0x8a8270;
      this.particles.emit({ x: t.x - sx * t.spec.scale.length * 0.45, y: 0.4, z: t.z - cx * t.spec.scale.length * 0.45, vy: 0.8, spread: 2.2, color: dustCol, life: 1.6, size: 1.6, grow: 2.2, drag: 1.2, alpha: 0.35, count: 2 });
    }
    // дым от повреждений
    if (t.hp < t.maxHp * 0.35) {
      t.smokeTimer -= dt;
      if (t.smokeTimer <= 0) {
        t.smokeTimer = 0.12;
        this.particles.emit({ x: t.x, y: 2.5, z: t.z, vy: 2.5, spread: 1, color: 0x222222, life: 2.2, size: 1.5, grow: 2.5, drag: 0.6, alpha: 0.5 });
      }
    }
    // неуязвимость: мерцание
    if (t.invuln > 0) {
      const f = Math.sin(this.time * 18) > 0 ? 0.8 : 0.1;
      t.model.bodyMats.forEach((m) => {
        m.emissive.setHex(t.team === 0 ? 0x2266ff : 0xff3333);
        m.emissiveIntensity = f;
      });
    } else if (t.model.bodyMats[0].emissiveIntensity > 0) {
      t.model.bodyMats.forEach((m) => (m.emissiveIntensity = 0));
    }
  }

  // Коллизия круга с препятствиями
  private collideCircle(x: number, z: number, r: number) {
    let hit = false;
    const half = this.world.half;
    if (x < -half + r) { x = -half + r; hit = true; }
    if (x > half - r) { x = half - r; hit = true; }
    if (z < -half + r) { z = -half + r; hit = true; }
    if (z > half - r) { z = half - r; hit = true; }
    for (const o of this.world.obstacles) {
      if (o.kind === 'wall') continue;
      if (!o.alive && !o.rubble) continue;
      if (Math.abs(o.x - x) > o.r + r + 1 || Math.abs(o.z - z) > o.r + r + 1) continue;
      if (o.shape === 'circle') {
        const dx = x - o.x;
        const dz = z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + r;
        if (d < min && d > 0.001) {
          x = o.x + (dx / d) * min;
          z = o.z + (dz / d) * min;
          hit = true;
        }
      } else {
        const cx = clamp(x, o.x - o.hw, o.x + o.hw);
        const cz = clamp(z, o.z - o.hd, o.z + o.hd);
        const dx = x - cx;
        const dz = z - cz;
        const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 0.001) {
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            // внутри — выталкиваем по кратчайшей оси
            const px = o.hw - Math.abs(x - o.x);
            const pz = o.hd - Math.abs(z - o.z);
            if (px < pz) x = o.x + Math.sign(x - o.x || 1) * (o.hw + r);
            else z = o.z + Math.sign(z - o.z || 1) * (o.hd + r);
          }
          hit = true;
        }
      }
    }
    return { x, z, hit };
  }

  private resolveTankCollisions() {
    const list = this.tanks.filter((t) => t.alive || t.wreck);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        // точное совпадение координат (двойной fallback-спавн) — расталкиваем в случайную сторону
        if (d <= 0.001) {
          const ang = Math.random() * Math.PI * 2;
          dx = Math.cos(ang);
          dz = Math.sin(ang);
          d = 1;
        }
        const min = (a.spec.radius + b.spec.radius) * 0.85;
        if (d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          const wa = a.wreck ? 0 : 1;
          const wb = b.wreck ? 0 : 1;
          const tot = wa + wb || 1;
          a.x -= nx * push * 2 * (wa / tot);
          a.z -= nz * push * 2 * (wa / tot);
          b.x += nx * push * 2 * (wb / tot);
          b.z += nz * push * 2 * (wb / tot);
          a.vel *= 0.6;
          b.vel *= 0.6;
        }
      }
  }

  // ================= Стрельба =================
  private tryFire(t: Tank) {
    if (t.reload > 0 || !t.alive || t.modules.gun.broken) return false;
    if (t.isPlayer && t.ammo[t.shell] <= 0) {
      if (this.time - t.lastHitTime > 0.6) {
        t.lastHitTime = this.time;
        audio.ui('deny');
        this.notify('Нет снарядов этого типа', 'warn');
      }
      return false;
    }
    const shell = SHELLS[t.shell];
    t.model.group.updateMatrixWorld(true);
    const mp = new THREE.Vector3();
    t.model.muzzle.getWorldPosition(mp);
    const spread = (t.modules.gun.hp < 0.5 ? 0.02 : 0.004) * (t.isPlayer ? 1 : 1.2);
    const yaw = t.turretYaw + (Math.random() - 0.5) * spread;
    const pitch = t.pitch + (Math.random() - 0.5) * spread;
    const v = t.stats.shellSpeed * shell.speedMul;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const mesh = new THREE.Mesh(this.tracerGeo, this.shellMats[t.shell]);
    mesh.position.copy(mp);
    this.scene.add(mesh);
    const light = null;
    const dmgMul = t.boostDamage > 0 ? BOOST_DAMAGE_MUL : 1;
    this.projectiles.push({ x: mp.x, y: mp.y, z: mp.z, vx: dir.x * v, vy: dir.y * v, vz: dir.z * v, owner: t, shell: t.shell, damage: t.stats.damage * dmgMul, mesh, life: 6, light });
    // перезарядка / магазин
    t.clip -= 1;
    if (t.clip > 0 && t.stats.magazine > 1) {
      t.reload = t.stats.magazineReload;
      t.reloadTotal = t.stats.magazineReload;
    } else {
      t.reload = t.stats.reload;
      t.reloadTotal = t.stats.reload;
      t.clip = 0;
    }
    if (t.isPlayer) {
      t.ammo[t.shell]--;
      this.stats.shots++;
      this.camRecoil = 1;
      this.camShake = Math.max(this.camShake, t.spec.id === 'e100' ? 0.9 : t.spec.id === 't34' ? 0.5 : 0.3);
    }
    // эффекты
    const heavy = t.spec.id === 'e100' ? 1.5 : t.spec.id === 't34' ? 1.0 : 0.7;
    this.particles.emit({ x: mp.x, y: mp.y, z: mp.z, vx: dir.x * 25, vy: dir.y * 25 + 2, vz: dir.z * 25, spread: 8, color: 0xffb040, life: 0.25, size: 2.5 * heavy, grow: 12, drag: 4, alpha: 1, count: 8 });
    this.particles.emit({ x: mp.x, y: mp.y, z: mp.z, vx: dir.x * 10, vy: 2, vz: dir.z * 10, spread: 5, color: 0x9a9a90, life: 1.6, size: 1.8 * heavy, grow: 4, drag: 2, alpha: 0.45, count: 10 });
    this.flash(mp.x, mp.y, mp.z, 90 * heavy, 0xffc070, 42);
    const d = Math.hypot(t.x - this.player.x, t.z - this.player.z);
    audio.shot(heavy, t.isPlayer ? 1 : clamp(1 - d / 160, 0.1, 1), t.isPlayer);
    // отдача корпуса
    t.model.hull.rotation.x -= 0.02 * heavy;
    return true;
  }

  private updateProjectiles(dt: number) {
    const remove: Projectile[] = [];
    for (const p of this.projectiles) {
      p.life -= dt;
      if (p.life <= 0) {
        remove.push(p);
        continue;
      }
      const steps = Math.ceil((Math.hypot(p.vx, p.vy, p.vz) * dt) / 1.2);
      const sdt = dt / steps;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        p.vy -= G * sdt;
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        p.z += p.vz * sdt;
        // земля
        if (p.y <= 0) {
          p.y = 0;
          this.impact(p, null, null);
          done = true;
          break;
        }
        // границы
        if (Math.abs(p.x) > this.world.half + 30 || Math.abs(p.z) > this.world.half + 30) {
          done = true;
          break;
        }
        // танки
        for (const t of this.tanks) {
          if (t === p.owner || (!t.alive && !t.wreck)) continue;
          const dx = p.x - t.x;
          const dz = p.z - t.z;
          const r = t.spec.radius * 0.95;
          if (dx * dx + dz * dz < r * r && p.y < t.spec.scale.height * 2.3 + 0.5) {
            this.impact(p, t.alive ? t : null, null);
            done = true;
            break;
          }
        }
        if (done) break;
        // препятствия
        for (const o of this.world.obstacles) {
          if (!o.alive || !o.blocksShots || o.kind === 'wall') continue;
          if (p.y > o.h) continue;
          if (o.shape === 'circle') {
            if (Math.hypot(p.x - o.x, p.z - o.z) < o.r) {
              this.impact(p, null, o);
              done = true;
              break;
            }
          } else if (Math.abs(p.x - o.x) < o.hw && Math.abs(p.z - o.z) < o.hd) {
            this.impact(p, null, o);
            done = true;
            break;
          }
        }
      }
      if (done) {
        remove.push(p);
        continue;
      }
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      p.mesh.rotateX(Math.PI / 2);
      if (p.light) p.light.position.set(p.x, p.y, p.z);
      // трассер
      this.particles.emit({ x: p.x, y: p.y, z: p.z, color: SHELLS[p.shell].color, life: 0.18, size: 0.7, alpha: 0.7 });
    }
    for (const p of remove) {
      this.scene.remove(p.mesh);
      if (p.light) this.scene.remove(p.light);
      const i = this.projectiles.indexOf(p);
      if (i >= 0) this.projectiles.splice(i, 1);
    }
  }

  private impact(p: Projectile, tank: Tank | null, obstacle: Obstacle | null) {
    const shell = SHELLS[p.shell];
    const x = p.x, y = Math.max(p.y, 0.3), z = p.z;
    const distToPlayer = Math.hypot(x - this.player.x, z - this.player.z);
    const gain = clamp(1 - distToPlayer / 140, 0.15, 1);
    // прямое попадание
    if (tank && this.isAlly(p.owner, tank)) {
      // дружественный огонь отключён: только искры
      this.particles.emit({ x, y, z, spread: 8, color: 0xffcf70, life: 0.4, size: 0.7, gravity: 12, count: 8 });
      audio.hit(gain * 0.5, true);
      if (p.owner.isPlayer) this.notify('Не стреляйте по союзникам!', 'warn');
      return;
    }
    if (tank) {
      const dmg = p.damage * shell.tankMul * (0.9 + Math.random() * 0.2);
      this.damageTank(tank, dmg, p.owner, shell.moduleChance, x, z);
      audio.hit(gain, true);
      this.flash(x, y + 1, z, 70, 0xffcf70, 36);
      this.particles.emit({ x, y, z, spread: 14, color: 0xffcf70, life: 0.5, size: 0.9, gravity: 12, drag: 1, count: 22 });
      this.particles.emit({ x, y, z, vy: 3, spread: 4, color: 0xfff0c0, life: 0.2, size: 4, grow: 14, alpha: 1, count: 3 });
      this.particles.emit({ x, y, z, vy: 2, spread: 3, color: 0x333333, life: 1.2, size: 1.4, grow: 3, alpha: 0.5, count: 6 });
      if (p.shell === 'HEAT') this.particles.emit({ x, y, z, vx: p.vx * 0.05, vy: p.vy * 0.05, vz: p.vz * 0.05, spread: 3, color: 0x7ad0ff, life: 0.5, size: 1.2, grow: 4, count: 8 });
    } else if (obstacle) {
      if (obstacle.destructible) {
        const dmg = p.damage * shell.buildingMul;
        this.damageObstacle(obstacle, dmg, p.owner);
      }
      audio.hit(gain, false);
      const col = obstacle.kind === 'crate' ? 0x8a6a3a : 0x9a9a90;
      this.particles.emit({ x, y, z, spread: 10, color: col, life: 0.9, size: 0.8, gravity: 14, count: 14 });
      this.particles.emit({ x, y, z, vy: 2, spread: 3, color: 0xaaa79a, life: 1.4, size: 2, grow: 4, alpha: 0.5, count: 6 });
    } else {
      // земля
      const dustCol = this.cfg.biome === 'winter' ? 0xe8eef2 : this.cfg.biome === 'desert' ? 0xd8c090 : 0x8a7a60;
      this.particles.emit({ x, y: 0.3, z, vy: 6, spread: 6, color: dustCol, life: 1.4, size: 2, grow: 4, gravity: 3, alpha: 0.6, count: 12 });
      audio.hit(gain * 0.6, false);
    }
    // взрыв / сплэш
    if (shell.splash > 0) {
      const r = shell.splash;
      this.flash(x, y + 1.5, z, 110, 0xff8a30, 50);
      this.particles.emit({ x, y, z, vy: 4, spread: r * 1.2, color: 0xff8a30, life: 0.45, size: 3, grow: 10, alpha: 0.9, count: 10 });
      this.particles.emit({ x, y, z, vy: 5, spread: r, color: 0x2a2a2a, life: 2, size: 2.5, grow: 5, drag: 0.5, alpha: 0.6, count: 12 });
      if (p.shell === 'HE') {
        audio.explosion(0.7, gain);
        if (p.owner.isPlayer) this.camShake = Math.max(this.camShake, clamp(1 - distToPlayer / 40, 0, 0.6));
        this.debris.burst(x, y, z, 4, 8);
        for (const t of this.tanks) {
          if (!t.alive || t === tank || t === p.owner || this.isAlly(p.owner, t)) continue;
          const d = Math.hypot(t.x - x, t.z - z);
          if (d < r + t.spec.radius) {
            const f = 1 - clamp((d - t.spec.radius) / r, 0, 1);
            this.damageTank(t, p.damage * shell.tankMul * 0.5 * f, p.owner, shell.moduleChance * 0.6, x, z);
          }
        }
        for (const o of this.world.obstacles) {
          if (!o.alive || !o.destructible || o === obstacle) continue;
          const d = Math.hypot(o.x - x, o.z - z);
          if (d < r + o.r) this.damageObstacle(o, p.damage * shell.buildingMul * 0.4, p.owner);
        }
      }
    }
  }

  private damageTank(t: Tank, dmg: number, attacker: Tank, moduleChance: number, hx: number, hz: number) {
    if (!t.alive || t.invuln > 0) {
      if (t.invuln > 0 && attacker.isPlayer) this.notify('Цель под защитой возрождения', 'warn');
      return;
    }
    dmg = Math.round(dmg);
    t.hp -= dmg;
    t.lastHitTime = this.time;
    t.capBlocked = 2.5;
    t.markerDirty = true;
    if (attacker.isPlayer) {
      this.stats.damage += Math.min(dmg, Math.max(0, t.hp + dmg));
      this.stats.hits++;
      this.hitMarker = 1;
    }
    // модули
    if (Math.random() < moduleChance) {
      const keys: (keyof Tank['modules'])[] = ['track', 'gun', 'engine'];
      const key = keys[Math.floor(Math.random() * keys.length)];
      const m = t.modules[key];
      if (!m.broken) {
        m.hp -= 0.35 + Math.random() * 0.4;
        if (m.hp <= 0) {
          m.hp = 0;
          m.broken = true;
          m.repair = key === 'track' ? 7 : key === 'gun' ? 6 : 8;
          const names = { track: 'Гусеница сбита', gun: 'Орудие повреждено', engine: 'Двигатель повреждён' };
          if (t.isPlayer) {
            this.notify(names[key] + '! Ремонт…', 'bad');
            audio.alert(true);
          } else if (attacker.isPlayer) this.notify(`${t.name}: ${names[key].toLowerCase()}`, 'good');
        } else if (t.isPlayer) this.notify({ track: 'Ходовая повреждена', gun: 'Орудие повреждено', engine: 'Двигатель повреждён' }[key], 'warn');
      }
    }
    if (t.isPlayer) {
      this.damageFlash = 1;
      this.camShake = Math.max(this.camShake, 0.7);
      this.damageDir = Math.atan2(hx - t.x, hz - t.z);
      audio.alert(false);
    }
    if (t.hp <= 0) {
      t.hp = 0;
      this.killTank(t, attacker);
    }
  }

  private damageObstacle(o: Obstacle, dmg: number, attacker: Tank) {
    o.hp -= dmg;
    if (o.hp > 0) return;
    o.alive = false;
    o.blocksShots = false;
    const x = o.x, z = o.z;
    const h = o.h;
    // крупные руины остаются препятствием для движения (уменьшенный футпринт),
    // но больше не блокируют снаряды/обзор и не рисуются как целые на миникарте
    const bigRuins = o.kind === 'building' || o.kind === 'hangar';
    if (bigRuins) {
      o.rubble = true;
      o.hw *= 0.65;
      o.hd *= 0.65;
      o.r *= 0.65;
    }
    this.scene.remove(o.mesh);
    // обломки
    const col = o.kind === 'crate' ? 0x6a4a2a : o.kind === 'building' || o.kind === 'hangar' ? 0x7a7568 : 0x8a8a84;
    this.debris.burst(x, h * 0.3, z, bigRuins ? 14 : 6, bigRuins ? 9 : 6, col, bigRuins ? 2 : 1);
    this.particles.emit({ x, y: h * 0.4, z, vy: 4, spread: o.r * 1.5, color: 0xb0a898, life: 2.5, size: 3, grow: 6, drag: 0.6, alpha: 0.7, count: bigRuins ? 40 : 12 });
    this.particles.emit({ x, y: h * 0.4, z, vy: 6, spread: o.r, color: 0xff9040, life: 0.4, size: 3, grow: 12, count: 6 });
    // руины — геометрии/материалы трекаем для dispose в конце боя
    const rubble = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 1 });
    this.rubbleDisposables.push(mat);
    const n = bigRuins ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const bg = new THREE.BoxGeometry(1 + Math.random() * o.hw, 0.5 + Math.random() * 1.2, 1 + Math.random() * o.hd);
      this.rubbleDisposables.push(bg);
      const m = new THREE.Mesh(bg, mat);
      m.position.set((Math.random() - 0.5) * o.hw * 1.4, 0.4, (Math.random() - 0.5) * o.hd * 1.4);
      m.rotation.set(Math.random() * 0.4, Math.random() * 3, Math.random() * 0.4);
      m.castShadow = true;
      rubble.add(m);
    }
    const craterGeo = new THREE.CircleGeometry(o.r * 1.1, 16);
    const craterMat = new THREE.MeshBasicMaterial({ color: 0x151412, transparent: true, opacity: 0.55 });
    this.rubbleDisposables.push(craterGeo, craterMat);
    const crater = new THREE.Mesh(craterGeo, craterMat);
    crater.rotation.x = -Math.PI / 2;
    crater.position.y = 0.03;
    rubble.add(crater);
    rubble.position.set(x, 0, z);
    freezeStatic(rubble);
    this.scene.add(rubble);
    o.mesh = rubble;
    this.aimTargetsDirty = true;
    const dist = Math.hypot(x - this.player.x, z - this.player.z);
    const big = o.kind === 'building' || o.kind === 'hangar';
    audio.explosion(big ? 1.3 : 0.6, clamp(1 - dist / 140, 0.2, 1));
    if (big) this.camShake = Math.max(this.camShake, clamp(1 - dist / 60, 0, 0.8));
    if (attacker.isPlayer) this.notify(big ? 'Здание разрушено' : o.kind === 'bunker' ? 'Дот уничтожен' : o.kind === 'concrete' ? 'Бетон разбит' : o.kind === 'barrier' ? 'Барьер уничтожен' : 'Ящики уничтожены', 'info');
  }

  private killTank(t: Tank, attacker: Tank) {
    t.alive = false;
    t.vel = 0;
    t.throttle = 0;
    const x = t.x, z = t.z;
    // взрыв (на слабом железе — меньше частиц)
    const q = this.lowEnd ? 0.55 : 1;
    this.flash(x, 3, z, 200, 0xff9040, 65);
    this.particles.emit({ x, y: 2, z, vy: 8, spread: 10, color: 0xffa040, life: 0.7, size: 5, grow: 16, drag: 1.5, count: Math.ceil(24 * q) });
    this.particles.emit({ x, y: 2, z, vy: 6, spread: 8, color: 0xff5010, life: 1.0, size: 4, grow: 8, drag: 1, count: Math.ceil(16 * q) });
    this.particles.emit({ x, y: 3, z, vy: 6, spread: 6, color: 0x1a1a1a, life: 4, size: 4, grow: 6, drag: 0.5, alpha: 0.7, count: Math.ceil(30 * q) });
    this.particles.emit({ x, y: 2, z, spread: 26, color: 0xffd080, life: 1.2, size: 0.8, gravity: 15, count: Math.ceil(40 * q) });
    this.debris.burst(x, 2, z, this.lowEnd ? 8 : 14, 12);
    const dist = Math.hypot(x - this.player.x, z - this.player.z);
    audio.explosion(1.6, clamp(1 - dist / 160, 0.25, 1));
    this.camShake = Math.max(this.camShake, clamp(1.4 - dist / 50, 0.2, 1.4));
    if (attacker !== t) attacker.kills++;
    if (attacker.isPlayer && attacker !== t) {
      this.stats.kills++;
      this.notify(`Уничтожен: ${t.name} (${t.spec.name})`, 'kill');
    }
    if (t.isPlayer) {
      this.notify(`Вы уничтожены. Противник: ${attacker.name}`, 'bad');
    }
    this.feed(`${attacker.name} ▶ ${t.name}`);
    this.aimTargetsDirty = true;
    if (this.cfg.mode === 'deathmatch') {
      t.wreck = true;
      wreckify(t.model);
      if (t.marker) t.marker.visible = false;
      this.wreckSmoke.push({ x, z, t: 25 });
    } else {
      t.model.group.visible = false;
      // гасим фары невидимого танка (иначе невидимка светит)
      t.model.headlights.forEach((h) => {
        h.intensity = 0;
        h.visible = false;
      });
      t.model.headCones.forEach((c) => {
        c.visible = false;
        setBeamOpacity(c, 0);
      });
      if (t.marker) t.marker.visible = false;
      t.respawnTimer = t.isPlayer ? 6 : 7 + Math.random() * 3;
      // сброс захвата точки, если погибший её захватывал
      for (const cp of this.world.capPoints) {
        if (Math.hypot(cp.x - x, cp.z - z) < cp.radius && cp.owner === -1) {
          if ((t.team === 0 && cp.progress > 0) || (t.team === 1 && cp.progress < 0)) cp.progress *= 0.5;
        }
      }
    }
  }

  // ================= Пикапы =================
  private updatePickups(dt: number) {
    for (const pk of this.world.pickups) {
      if (!pk.active) {
        pk.respawnIn -= dt;
        if (pk.respawnIn <= 0) {
          pk.active = true;
          pk.mesh.visible = true;
        }
        continue;
      }
      pk.mesh.rotation.y += dt * 1.5;
      pk.mesh.position.y = 1.4 + Math.sin(this.time * 2 + pk.id) * 0.3;
      for (const t of this.tanks) {
        if (!t.alive) continue;
        if (Math.hypot(t.x - pk.x, t.z - pk.z) < t.spec.radius + 1.5) {
          this.applyPickup(t, pk);
          break;
        }
      }
    }
  }

  private applyPickup(t: Tank, pk: Pickup) {
    pk.active = false;
    pk.respawnIn = this.cfg.mode === 'deathmatch' ? PICKUP_RESPAWN_DM : PICKUP_RESPAWN_DEFAULT;
    pk.mesh.visible = false;
    let text = '';
    switch (pk.type.id) {
      case 'repair':
        t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * 0.4));
        for (const m of Object.values(t.modules)) {
          m.broken = false;
          m.hp = Math.max(m.hp, 0.8);
        }
        text = 'Ремкомплект: +40% прочности, модули восстановлены';
        break;
      case 'speed':
        t.boostSpeed = BOOST_DURATION;
        text = `Форсаж: +${Math.round((BOOST_SPEED_MUL - 1) * 100)}% скорости на ${BOOST_DURATION} с`;
        break;
      case 'damage':
        t.boostDamage = BOOST_DURATION;
        text = `Усиленный заряд: +${Math.round((BOOST_DAMAGE_MUL - 1) * 100)}% урона на ${BOOST_DURATION} с`;
        break;
      case 'ammo':
        (Object.keys(t.ammo) as ShellType[]).forEach((k) => (t.ammo[k] = Math.min(t.stats.ammo[k], t.ammo[k] + Math.ceil(t.stats.ammo[k] * 0.5))));
        text = 'Боеприпасы пополнены';
        break;
    }
    t.markerDirty = true;
    this.particles.emit({ x: pk.x, y: 1.5, z: pk.z, vy: 5, spread: 4, color: pk.type.color, life: 0.8, size: 1.2, grow: 2, count: 20 });
    if (t.isPlayer) {
      this.notify(text, 'good');
      audio.pickup();
    }
  }

  // ================= Захват точек =================
  private updateCapture(dt: number) {
    for (const cp of this.world.capPoints) {
      let blue = 0, red = 0;
      const blueTanks: Tank[] = [];
      for (const t of this.tanks) {
        if (!t.alive || t.capBlocked > 0) continue;
        if (Math.hypot(t.x - cp.x, t.z - cp.z) < cp.radius) {
          if (t.team === 0) { blue++; blueTanks.push(t); } else red++;
        }
      }
      const prevOwner = cp.owner;
      cp.contested = blue > 0 && red > 0;
      cp.capturing = -1;
      if (!cp.contested) {
        if (blue > 0 && (cp.owner !== 0 || cp.progress < 1)) {
          const rate = 0.14 * (1 + 0.5 * (blue - 1));
          cp.progress = Math.min(1, cp.progress + rate * dt);
          cp.capturing = 0;
        } else if (red > 0 && (cp.owner !== 1 || cp.progress > -1)) {
          const rate = 0.14 * (1 + 0.5 * (red - 1));
          cp.progress = Math.max(-1, cp.progress - rate * dt);
          cp.capturing = 1;
        } else if (blue === 0 && red === 0) {
          const target = cp.owner === 0 ? 1 : cp.owner === 1 ? -1 : 0;
          cp.progress += clamp(target - cp.progress, -0.04 * dt, 0.04 * dt);
        }
      }
      // смена владельца
      if (cp.owner === -1) {
        if (cp.progress >= 1) cp.owner = 0;
        else if (cp.progress <= -1) cp.owner = 1;
      } else if (cp.owner === 0 && cp.progress <= 0) {
        cp.owner = -1;
      } else if (cp.owner === 1 && cp.progress >= 0) {
        cp.owner = -1;
      }
      if (cp.owner !== prevOwner) {
        if (cp.owner === 0) {
          this.notify(`Точка ${cp.letter} захвачена синими`, 'good');
          if (blueTanks.includes(this.player)) this.stats.captures++;
          audio.alert(true);
        } else if (cp.owner === 1) {
          this.notify(`Точка ${cp.letter} захвачена красными`, 'bad');
          audio.alert(false);
        } else {
          this.notify(`Точка ${cp.letter} нейтрализована`, 'warn');
        }
      }
      // визуал
      const owner = cp.owner;
      const capCol = cp.contested ? 0xffb020 : cp.capturing === 0 ? 0x4aa3ff : cp.capturing === 1 ? 0xff5a5a : owner === 0 ? 0x4aa3ff : owner === 1 ? 0xff5a5a : 0xd8dcc8;
      const pulse = cp.capturing !== -1 || cp.contested ? 0.6 + 0.4 * Math.sin(this.time * 6) : 1;
      (cp.ring.material as THREE.MeshBasicMaterial).color.setHex(capCol);
      (cp.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * pulse;
      (cp.fill.material as THREE.MeshBasicMaterial).color.setHex(cp.progress > 0 ? 0x4aa3ff : cp.progress < 0 ? 0xff5a5a : 0xd8dcc8);
      (cp.fill.material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.abs(cp.progress) * 0.3;
      cp.fill.scale.setScalar(Math.max(0.05, Math.abs(cp.progress)));
      (cp.beacon.material as THREE.MeshBasicMaterial).color.setHex(capCol);
      (cp.beacon.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.2 * pulse;
      cp.light.color.setHex(capCol);
    }
    // очки
    this.scoreAcc += dt;
    while (this.scoreAcc >= 1) {
      this.scoreAcc -= 1;
      for (const cp of this.world.capPoints) {
        if (cp.owner === 0) this.score.blue += 1;
        else if (cp.owner === 1) this.score.red += 1;
      }
    }
    this.timeLeft -= dt;
  }

  // ================= ИИ ботов =================
  private isEnemy(a: Tank, b: Tank) {
    if (a === b) return false;
    return this.cfg.mode === 'deathmatch' ? true : a.team !== b.team;
  }
  private isAlly(a: Tank, b: Tank) {
    return a !== b && this.cfg.mode === 'capture' && a.team === b.team;
  }

  private hasLOS(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax, dz = bz - az;
    const d2 = dx * dx + dz * dz;
    if (d2 > 220 * 220) return false;
    if (d2 < 4) return true;
    const d = Math.sqrt(d2);
    // шаг 4м вместо 2.5м — в 1.6 раза меньше точек; для ИИ точности хватает
    const steps = Math.ceil(d / 4);
    const minX = Math.min(ax, bx) - 4, maxX = Math.max(ax, bx) + 4;
    const minZ = Math.min(az, bz) - 4, maxZ = Math.max(az, bz) + 4;
    const obs = this.world.obstacles;
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const x = ax + dx * f;
      const z = az + dz * f;
      for (let k = 0; k < obs.length; k++) {
        const o = obs[k];
        if (!o.alive || !o.blocksShots || o.kind === 'wall' || o.h < 2) continue;
        // быстрый reject по bbox сегмента
        if (o.x < minX || o.x > maxX || o.z < minZ || o.z > maxZ) continue;
        if (o.shape === 'circle') {
          const ox = x - o.x, oz = z - o.z;
          if (ox * ox + oz * oz < o.r * o.r) return false;
        } else if (x > o.x - o.hw && x < o.x + o.hw && z > o.z - o.hd && z < o.z + o.hd) return false;
      }
    }
    return true;
  }

  private pathClear(x: number, z: number, dirX: number, dirZ: number, len: number, r: number) {
    // шаг 3м вместо 2м — меньше точек, для рулёжки достаточно
    const steps = Math.ceil(len / 3);
    const obs = this.world.obstacles;
    for (let i = 1; i <= steps; i++) {
      const f = (len * i) / steps;
      const px = x + dirX * f;
      const pz = z + dirZ * f;
      if (Math.abs(px) > this.world.half - r || Math.abs(pz) > this.world.half - r) return false;
      for (let k = 0; k < obs.length; k++) {
        const o = obs[k];
        if (o.kind === 'wall') continue;
        if (!o.alive && !o.rubble) continue;
        const rr = o.r + r + 1;
        const ox = o.x - px, oz = o.z - pz;
        if (ox > rr || ox < -rr || oz > rr || oz < -rr) continue;
        if (o.shape === 'circle') {
          if (ox * ox + oz * oz < (o.r + r) * (o.r + r)) return false;
        } else {
          const dx = Math.abs(ox) - o.hw;
          const dz = Math.abs(oz) - o.hd;
          if (dx <= 0 && dz <= 0) return false;
          if (dx > 0 && dz > 0 && dx * dx + dz * dz < r * r) return false;
          else if ((dx > 0 && dz <= 0 && dx < r) || (dz > 0 && dx <= 0 && dz < r)) return false;
        }
      }
      for (const t of this.tanks) {
        if (!t.wreck) continue;
        const wx = px - t.x, wz = pz - t.z;
        const wr = t.spec.radius + r;
        if (wx * wx + wz * wz < wr * wr) return false;
      }
    }
    return true;
  }

  private updateBot(t: Tank, dt: number) {
    const ai = t.ai!;
    if (!t.alive) return;
    ai.retarget -= dt;
    ai.stateTimer -= dt;
    ai.errorTimer -= dt;
    ai.think -= dt;
    // Дорогие решения (LOS, выбор цели/состояния, объезд) — ~5 Гц со стаггером по ботам.
    // Каждый кадр остаются только дешёвая рулёжка к кэшированной точке и доводка башни.
    const doThink = ai.think <= 0;
    if (doThink) ai.think = 0.18 + Math.random() * 0.07;
    // ---- выбор цели (только на think) ----
    if (doThink && (ai.retarget <= 0 || (ai.target && !ai.target.alive))) {
      ai.retarget = 1.5 + Math.random() * 1.5;
      let best: Tank | null = null;
      let bestScore = 1e9;
      for (const e of this.tanks) {
        if (!e.alive || !this.isEnemy(t, e)) continue;
        const dxe = e.x - t.x, dze = e.z - t.z;
        const d = Math.sqrt(dxe * dxe + dze * dze);
        // распределение фокуса
        let focus = 0;
        for (const o of this.tanks) if (o.ai && o.alive && this.isAlly(t, o) && o.ai.target === e) focus++;
        const threat = e.hp / e.maxHp < 0.3 ? -15 : 0;
        const losScore = this.hasLOS(t.x, t.z, e.x, e.z) ? 0 : 25;
        const score = d + focus * 18 + threat + losScore + (e.isPlayer ? -5 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      ai.target = best;
      // выбор снаряда — тоже здесь, а не каждый кадр
      if (best) t.shell = best.spec.id === 't100lt' && Math.random() < 0.3 ? 'HE' : 'AP';
    } else if (ai.target && !ai.target.alive) ai.target = null;
    const target = ai.target;
    const dxt = target ? target.x - t.x : 0;
    const dzt = target ? target.z - t.z : 0;
    const distT = target ? Math.sqrt(dxt * dxt + dzt * dzt) : 1e9;
    // LOS к текущей цели — только на think, иначе кэш
    if (doThink) ai.los = target ? this.hasLOS(t.x, t.z, target.x, target.z) : false;
    const los = ai.los;
    const recentlyHit = this.time - t.lastHitTime < 2.5;
    const heavy = t.spec.id === 'e100';
    const light = t.spec.id === 't100lt';

    // ---- выбор состояния (только на think) ----
    if (doThink && ai.stateTimer <= 0) {
      ai.stateTimer = 2 + Math.random() * 2.5;
      const lowHp = t.hp / t.maxHp < 0.35;
      const longReload = t.reload > 2.5 && t.clip === 0;
      if (this.cfg.mode === 'capture' && (!target || distT > 70 || Math.random() < 0.45)) {
        ai.state = 'objective';
        ai.objective = this.chooseObjective(t);
        ai.moveTarget = ai.objective ? { x: ai.objective.x + (Math.random() - 0.5) * 10, z: ai.objective.z + (Math.random() - 0.5) * 10 } : null;
      } else if (target && (lowHp || (longReload && recentlyHit)) && Math.random() < 0.7) {
        ai.state = 'cover';
        ai.moveTarget = this.findCover(t, target);
        if (!ai.moveTarget) ai.state = 'engage';
      } else if (target) {
        ai.state = 'engage';
        if (Math.random() < 0.3) ai.strafeDir *= -1;
      } else {
        ai.state = 'wander';
        ai.moveTarget = this.randomPoint();
      }
    }

    // ---- бонусы: боты тоже охотятся за пикапами (только на think) ----
    if (doThink) {
      const hpRatio = t.hp / t.maxHp;
      let want: ('repair' | 'damage' | 'speed')[] | null = null;
      if (hpRatio < 0.5) want = ['repair'];
      else if (t.boostDamage <= 0 && (!target || distT > 40) && Math.random() < 0.6) want = ['damage', 'speed'];
      else if (!target && Math.random() < 0.4) want = ['repair', 'damage', 'speed'];
      if (want && (ai.state === 'wander' || ai.state === 'objective' || hpRatio < 0.4 || distT > 45)) {
        const pk = this.findNearestPickup(t.x, t.z, want, 90);
        if (pk) {
          ai.moveTarget = { x: pk.x, z: pk.z };
          // если далеко от боя — едем за бонусом, но продолжаем стрелять по цели
          if (ai.state === 'engage' && distT > 35) {
            ai.state = 'wander';
            ai.stateTimer = 1.5;
          }
        }
      }
    }

    // ---- целевая точка движения: пересчёт engage-точки только на think (без аллокаций каждый кадр) ----
    if (doThink) {
      if (ai.state === 'engage' && target) {
        const minD = heavy ? 22 : light ? 18 : 26;
        const maxD = heavy ? 50 : light ? 42 : 58;
        const ang = Math.atan2(t.x - target.x, t.z - target.z);
        if (distT < minD) {
          ai.moveTarget = { x: target.x + Math.sin(ang) * (minD + 10), z: target.z + Math.cos(ang) * (minD + 10) };
        } else if (distT > maxD || !los) {
          let mx = target.x + Math.sin(ang) * (maxD - 12);
          let mz = target.z + Math.cos(ang) * (maxD - 12);
          if (!los) {
            // обходим препятствие, смещаясь вбок
            const side = ai.strafeDir;
            mx += Math.cos(ang) * side * 14;
            mz -= Math.sin(ang) * side * 14;
          }
          ai.moveTarget = { x: mx, z: mz };
        } else {
          const a2 = ang + ai.strafeDir * 0.55;
          ai.moveTarget = { x: target.x + Math.sin(a2) * distT, z: target.z + Math.cos(a2) * distT };
        }
      } else if (ai.state === 'objective' && ai.objective) {
        const cp = ai.objective;
        const cdx = t.x - cp.x, cdz = t.z - cp.z;
        const inside = cdx * cdx + cdz * cdz < (cp.radius - 2) * (cp.radius - 2);
        const mt0 = ai.moveTarget;
        if (inside) {
          // стоим на точке, слегка перемещаясь
          if (!mt0 || (mt0.x - t.x) * (mt0.x - t.x) + (mt0.z - t.z) * (mt0.z - t.z) < 9) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * (cp.radius - 4);
            ai.moveTarget = { x: cp.x + Math.sin(a) * r, z: cp.z + Math.cos(a) * r };
          }
          // если точка наша и враг рядом — вступаем в бой
          if (target && distT < 45 && los && cp.owner === t.team) {
            ai.state = 'engage';
            ai.stateTimer = 3;
          }
        }
      } else {
        const mt0 = ai.moveTarget;
        if (!mt0 || (mt0.x - t.x) * (mt0.x - t.x) + (mt0.z - t.z) * (mt0.z - t.z) < 16) {
          ai.moveTarget = this.randomPoint();
        }
      }
    }
    const mt = ai.moveTarget;

    // ---- рулёжка с объездом препятствий ----
    let throttle = 0;
    let steer = 0;
    if (mt) {
      const dx = mt.x - t.x;
      const dz = mt.z - t.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.5) {
        const desired = Math.atan2(dx, dz);
        const r = t.spec.radius * 0.9;
        const probe = Math.min(dist, 12 + Math.abs(t.vel) * 0.8);
        let chosen = desired;
        let found = false;
        // 5 направлений вместо 11 — достаточно для объезда, в 2 раза дешевле.
        // Полный веер (11) проверяем только на think-тике при застревании.
        const offsets = doThink && ai.stuck > 0.6
          ? [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6]
          : [0, 0.5, -0.5, 1.1, -1.1];
        for (let oi = 0; oi < offsets.length; oi++) {
          const a = desired + offsets[oi];
          if (this.pathClear(t.x, t.z, Math.sin(a), Math.cos(a), probe, r)) {
            chosen = a;
            found = true;
            break;
          }
        }
        const diff = angDiff(chosen, t.yaw);
        if (ai.unstick > 0) {
          ai.unstick -= dt;
          throttle = -0.8;
          steer = ai.strafeDir;
        } else {
          steer = clamp(diff * 2.5, -1, 1);
          if (Math.abs(diff) > 2.3) {
            throttle = -0.6;
            steer = -steer;
          } else throttle = Math.abs(diff) < 1.0 ? 1 : 0.35;
          if (!found) throttle = -0.5;
        }
        // застревание
        if (Math.abs(t.vel) < 0.5 && throttle > 0.3) {
          ai.stuck += dt;
          if (ai.stuck > 1.4) {
            ai.stuck = 0;
            ai.unstick = 1.2;
            ai.strafeDir *= -1;
          }
        } else ai.stuck = Math.max(0, ai.stuck - dt);
      } else if (ai.state === 'wander') {
        ai.moveTarget = null;
      }
    }
    // сброс скорости при поломке
    t.throttle = throttle;
    t.steer = steer;

    // ---- наведение и стрельба ----
    if (target) {
      if (ai.errorTimer <= 0) {
        ai.errorTimer = 0.8 + Math.random();
        const err = 2.5 + (1 - ai.skill) * 11;
        ai.aimError = { x: (Math.random() - 0.5) * err, z: (Math.random() - 0.5) * err };
      }
      const v = t.stats.shellSpeed * SHELLS[t.shell].speedMul;
      const tof = distT / v;
      const tvx = Math.sin(target.yaw) * target.vel;
      const tvz = Math.cos(target.yaw) * target.vel;
      const lead = ai.skill * 0.95;
      const ax = target.x + tvx * tof * lead + ai.aimError.x;
      const az = target.z + tvz * tof * lead + ai.aimError.z;
      const desiredYaw = Math.atan2(ax - t.x, az - t.z);
      const d = angDiff(desiredYaw, t.turretYaw);
      const rate = t.stats.turretTurn * (t.modules.gun.broken ? 0.5 : 1);
      t.turretYaw += clamp(d, -rate * dt, rate * dt);
      const hd = Math.hypot(ax - t.x, az - t.z);
      t.pitch = clamp(ballisticPitch(v, hd, 1.4 - 2.2), -0.1, 0.4);
      if (Math.abs(d) < 0.035 && distT < 120 && los && t.reload <= 0 && !t.modules.gun.broken) {
        if (Math.random() < 0.6 + ai.skill * 0.4) this.tryFire(t);
        else t.reload = 0.3;
      }
    } else {
      // башня по ходу движения
      const d = angDiff(t.yaw, t.turretYaw);
      t.turretYaw += clamp(d, -t.stats.turretTurn * dt, t.stats.turretTurn * dt);
      t.pitch = 0;
    }
  }

  private randomPoint() {
    for (let i = 0; i < 20; i++) {
      const x = (Math.random() * 2 - 1) * (this.world.half - 14);
      const z = (Math.random() * 2 - 1) * (this.world.half - 14);
      if (this.isSpotFree(x, z, 4, null)) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  private chooseObjective(t: Tank): CapPoint | null {
    const pts = this.world.capPoints;
    if (!pts.length) return null;
    let best: CapPoint | null = null;
    let bestScore = 1e9;
    for (const cp of pts) {
      const d = Math.hypot(cp.x - t.x, cp.z - t.z);
      let s = d;
      if (cp.owner === t.team) s += 60; // свои — защищать только если рядом
      if (cp.contested) s -= 20;
      // сколько союзников уже туда идут
      let allies = 0;
      for (const o of this.tanks) if (o.ai && this.isAlly(t, o) && o.alive && o.ai.objective === cp) allies++;
      s += allies * 22;
      s += Math.random() * 25;
      if (s < bestScore) {
        bestScore = s;
        best = cp;
      }
    }
    return best;
  }

  private findCover(t: Tank, enemy: Tank): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = 1e9;
    for (const o of this.world.obstacles) {
      if (!o.alive || o.kind === 'wall' || o.kind === 'tree' || o.kind === 'lamp' || o.h < 2.5) continue;
      const d = Math.hypot(o.x - t.x, o.z - t.z);
      if (d > 55) continue;
      const ax = o.x - enemy.x, az = o.z - enemy.z;
      const l = Math.hypot(ax, az) || 1;
      const px = o.x + (ax / l) * (o.r + t.spec.radius + 2);
      const pz = o.z + (az / l) * (o.r + t.spec.radius + 2);
      if (!this.isSpotFree(px, pz, t.spec.radius, t)) continue;
      if (d < bestD) {
        bestD = d;
        best = { x: px, z: pz };
      }
    }
    return best;
  }

  private findNearestPickup(x: number, z: number, want: ('repair' | 'damage' | 'speed')[], maxDist: number): Pickup | null {
    let best: Pickup | null = null;
    let bestD = maxDist;
    for (const pk of this.world.pickups) {
      if (!pk.active) continue;
      if (!want.includes(pk.type.id as 'repair' | 'damage' | 'speed')) continue;
      const d = Math.hypot(pk.x - x, pk.z - z);
      if (d < bestD) {
        bestD = d;
        best = pk;
      }
    }
    return best;
  }

  // ================= Маркеры =================
  private updateMarkers() {
    for (const t of this.tanks) {
      if (!t.marker || !t.markerCtx || !t.markerTex) continue;
      if (!t.alive) {
        t.marker.visible = false;
        continue;
      }
      const d = Math.hypot(t.x - this.player.x, t.z - this.player.z);
      t.marker.visible = d < 150 * this.world.env.visibility + 40;
      t.marker.position.set(t.x, t.spec.scale.height * 2 + 3.2, t.z);
      const s = clamp(d / 40, 0.6, 2.2);
      t.marker.scale.set(9 * s, 2.25 * s, 1);
      if (t.markerDirty) {
        t.markerDirty = false;
        const c = t.markerCtx;
        c.clearRect(0, 0, 256, 64);
        const col = this.cfg.mode === 'deathmatch' || t.team === 1 ? TEAM_COLORS.red : TEAM_COLORS.blue;
        c.font = 'bold 22px monospace';
        c.textAlign = 'center';
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.fillRect(28, 4, 200, 56);
        c.fillStyle = col;
        c.fillText(`${t.name} · ${t.spec.name}`, 128, 28);
        c.fillStyle = '#111';
        c.fillRect(40, 38, 176, 12);
        c.fillStyle = col;
        c.fillRect(40, 38, 176 * (t.hp / t.maxHp), 12);
        const crit = t.modules.track.broken || t.modules.gun.broken || t.modules.engine.broken;
        if (crit) {
          c.fillStyle = '#ffb020';
          c.font = 'bold 16px monospace';
          c.fillText('⚠', 24, 48);
        }
        t.markerTex.needsUpdate = true;
      }
    }
  }

  // ================= Прочие эффекты =================
  private updateEffectsAmbient(dt: number) {
    // затухание вспышек выстрелов/взрывов
    for (const f of this.flashPool) {
      if (f.life > 0) {
        f.life -= dt;
        if (f.life <= 0) {
          f.light.intensity = 0;
          f.light.visible = false;
        } else {
          f.light.intensity *= Math.max(0, 1 - dt * 9);
        }
      }
    }
    // лёгкое мерцание фонарей (живой свет); БАГФИКС: раньше мерцание сбрасывало
    // затемнение сумерек (ставило полную яркость), теперь масштабируем от darkFactor
    const dark = this.world.env.darkFactor;
    if (dark > 0.35) {
      for (const lamp of this.world.lamps) {
        if (!lamp.light.visible) continue;
        const base = dark * lamp.baseIntensity;
        lamp.light.intensity = base * (0.92 + 0.08 * Math.sin(this.time * 7 + lamp.phase) * Math.sin(this.time * 3.1 + lamp.phase * 2));
      }
    }
    // дым остовов (in-place, без аллокации нового массива каждый кадр)
    for (let i = this.wreckSmoke.length - 1; i >= 0; i--) {
      const w = this.wreckSmoke[i];
      w.t -= dt;
      if (w.t <= 0) {
        this.wreckSmoke[i] = this.wreckSmoke[this.wreckSmoke.length - 1];
        this.wreckSmoke.pop();
        continue;
      }
      if (Math.random() < dt * 10) {
        this.particles.emit({ x: w.x, y: 2.5, z: w.z, vy: 3, spread: 1.5, color: 0x1c1c1c, life: 3, size: 2.5, grow: 3, drag: 0.4, alpha: 0.55 });
        if (Math.random() < 0.3) this.particles.emit({ x: w.x, y: 1.8, z: w.z, vy: 2, spread: 1, color: 0xff6a20, life: 0.4, size: 1.5, grow: 2, alpha: 0.8 });
      }
    }
    // гроза
    if (this.cfg.weather === 'storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 6 + Math.random() * 10;
        this.lightningFlash = 0.35;
        const delay = 300 + Math.random() * 900;
        setTimeout(() => {
          if (!this.disposed && !this.finished) {
            try { audio.thunder(); } catch { /* */ }
          }
        }, delay);
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash -= dt;
        const f = this.lightningFlash > 0 && Math.sin(this.lightningFlash * 60) > -0.3 ? 5 : 1;
        this.world.env.hemi.intensity = this.hemiBase * f;
        this.world.env.sun.intensity = f > 1 ? 3 : this.world.env.sun.intensity;
      } else this.world.env.hemi.intensity = this.hemiBase;
    }
    // солнце следует за игроком (тени) — без аллокаций
    const sun = this.world.env.sun;
    sun.target.position.set(this.player.x, 0, this.player.z);
    this.tmpDir.copy(this.world.env.sunDir).multiplyScalar(140);
    sun.position.set(this.player.x + this.tmpDir.x, this.tmpDir.y, this.player.z + this.tmpDir.z);
  }

  private static readonly AIM_V2 = new THREE.Vector2(0, 0);

  // ================= Камера =================
  // Столкновение камеры — аналитикой по obstacles (дешёвые bbox-тесты),
  // без Raycaster по сотням мешей каждый кадр (это был главный фриз).
  private cameraBlocked(pivot: THREE.Vector3, desired: THREE.Vector3): number {
    const dx = desired.x - pivot.x, dy = desired.y - pivot.y, dz = desired.z - pivot.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return len;
    const steps = Math.min(12, Math.ceil(len / 2));
    const obs = this.world.obstacles;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const x = pivot.x + dx * f;
      const y = pivot.y + dy * f;
      const z = pivot.z + dz * f;
      if (y < 0.5 || y > 30) continue;
      for (let k = 0; k < obs.length; k++) {
        const o = obs[k];
        if (!o.alive || o.kind === 'wall' || o.kind === 'tree' || o.kind === 'lamp') continue;
        if (y > o.h + 0.5) continue;
        const rr = o.r + 0.9;
        const ox = o.x - x, oz = o.z - z;
        if (ox > rr || ox < -rr || oz > rr || oz < -rr) continue;
        if (o.shape === 'circle') {
          if (ox * ox + oz * oz < 0.9 * 0.9) return len * f;
        } else if (Math.abs(x - o.x) < o.hw + 0.6 && Math.abs(z - o.z) < o.hd + 0.6) {
          return len * f;
        }
      }
    }
    return len;
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const spec = p.spec;
    this.camShake = Math.max(0, this.camShake - dt * 2.2);
    this.camRecoil = Math.max(0, this.camRecoil - dt * 3);
    const dist = (spec.id === 'e100' ? 19 : spec.id === 't34' ? 16 : 14) + this.camRecoil * 1.5;
    const yaw = this.camYaw;
    const pitch = this.camPitch;
    const pivot = this.tmpPivot.set(p.x, 2.5, p.z);
    // Высота камеры почти не зависит от наведения: слабая связь (×0.12),
    // чтобы камера висела стабильно за танком и не «летала» вверх/вниз за прицелом.
    // Свободно движется только точка взгляда (см. look ниже).
    const back = this.tmpBack.set(-Math.sin(yaw) * Math.cos(pitch), 0.38 + Math.sin(pitch) * 0.12, -Math.cos(yaw) * Math.cos(pitch)).normalize();
    const desired = this.tmpDesired.copy(pivot).addScaledVector(back, dist);
    // не даём камере уйти под землю
    if (desired.y < 1.5) desired.y = 1.5;
    // столкновение камеры: аналитика каждый кадр — дёшево; тяжёлый raycast убран
    this.camRayTimer -= dt;
    if (this.camRayTimer <= 0) {
      this.camRayTimer = 0.08;
      const toCam = this.tmpToCam.copy(desired).sub(pivot);
      const len = toCam.length();
      if (len > 0.001) {
        const hitLen = this.cameraBlocked(pivot, desired);
        this.camBlockedDist = hitLen < len - 0.5 ? hitLen : -1;
      } else this.camBlockedDist = -1;
    }
    if (this.camBlockedDist >= 0) {
      const toCam = this.tmpToCam.copy(desired).sub(pivot);
      const len = toCam.length();
      if (len > 0.001) {
        this.tmpDir.copy(toCam).divideScalar(len);
        desired.copy(pivot).addScaledVector(this.tmpDir, Math.max(3, this.camBlockedDist - 0.8));
      }
    }
    if (!p.alive && this.cfg.mode === 'deathmatch') {
      // орбита вокруг остова
      desired.set(p.x + Math.sin(this.time * 0.3) * 24, 10, p.z + Math.cos(this.time * 0.3) * 24);
    }
    const smooth = dt > 0 ? 1 - Math.pow(0.0001, dt) : 1;
    this.camPos.lerp(desired, this.firstFrameDone ? smooth : 1);
    const look = this.tmpLook.set(p.x + Math.sin(yaw) * 30 * Math.cos(pitch), 4.5 + Math.sin(pitch) * 15, p.z + Math.cos(yaw) * 30 * Math.cos(pitch));
    if (!p.alive) look.set(p.x, 1, p.z);
    this.camLook.lerp(look, this.firstFrameDone ? Math.min(1, smooth * 1.5) : 1);
    const sh = dt > 0 ? this.camShake * this.camShake * 0.5 : 0;
    const speedShake = dt > 0 ? (Math.abs(p.vel) / p.stats.speed) * 0.03 : 0;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * (sh + speedShake), this.camPos.y + (Math.random() - 0.5) * (sh + speedShake), this.camPos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camLook);
    this.camera.rotation.z += (Math.random() - 0.5) * sh * 0.02;
    const targetFov = this.baseFov + (Math.abs(p.vel) / p.stats.speed) * 8 + this.camRecoil * 2;
    if (Math.abs(targetFov - this.camera.fov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
    }
    // точка прицела: луч из центра экрана — только 12 Гц + переиспользуемый массив целей
    if (p.alive) {
      this.aimTimer -= dt;
      if (this.aimTimer <= 0) {
        this.aimTimer = 0.08;
        if (this.aimTargetsDirty) {
          this.aimTargets.length = 0;
          for (const o of this.world.obstacles) if (o.alive && o.kind !== 'wall' && o.kind !== 'lamp') this.aimTargets.push(o.mesh);
          for (const t of this.tanks) if (t !== p && (t.alive || t.wreck)) this.aimTargets.push(t.hitbox);
          this.aimTargetsDirty = false;
        } else {
          // танки могли умереть/респавнуться — обновляем хитбоксы без полного ребилда редко
          // (дешёво: всего ~13 записей)
          let ti = 0;
          for (const t of this.tanks) if (t !== p && (t.alive || t.wreck)) ti++;
          // если число целей mismatch — пересоберём в следующий тик
          let want = 0;
          for (const o of this.world.obstacles) if (o.alive && o.kind !== 'wall' && o.kind !== 'lamp') want++;
          want += ti;
          if (want !== this.aimTargets.length) this.aimTargetsDirty = true;
        }
        this.raycaster.setFromCamera(GameEngine.AIM_V2, this.camera);
        this.raycaster.far = 400;
        const hs = this.raycaster.intersectObjects(this.aimTargets, true);
        let pt: THREE.Vector3 | null = null;
        for (const h of hs) {
          if (h.distance < 6) continue;
          pt = h.point;
          break;
        }
        if (!pt) {
          const dir = this.raycaster.ray.direction;
          const org = this.raycaster.ray.origin;
          if (dir.y < -0.001) {
            const tg = (0.6 - org.y) / dir.y;
            this.tmpDir.copy(dir).multiplyScalar(Math.min(tg, 400));
            pt = this.tmpToCam.copy(org).add(this.tmpDir);
          } else {
            this.tmpDir.copy(dir).multiplyScalar(300);
            pt = this.tmpToCam.copy(org).add(this.tmpDir);
          }
        }
        this.aimPoint.copy(pt);
      }
    }
  }

  // ================= Завершение =================
  private checkEnd(dt: number) {
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.endTimer = -1;
        this.finish();
      }
      return;
    }
    if (this.cfg.mode === 'deathmatch') {
      const enemiesAlive = this.tanks.filter((t) => t !== this.player && t.alive).length;
      if (enemiesAlive === 0 || !this.player.alive) {
        this.ended = true;
        this.endTimer = enemiesAlive === 0 ? 2 : 3.5;
      }
    } else if (this.timeLeft <= 0) {
      this.ended = true;
      this.endTimer = 1.2;
    }
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    try {
      audio.stopBattleAudio();
    } catch {
      /* */
    }
    try {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } catch {
      /* */
    }
    let outcome: BattleResult['outcome'];
    if (this.cfg.mode === 'deathmatch') outcome = this.player.alive ? 'win' : 'lose';
    else outcome = this.score.blue > this.score.red ? 'win' : this.score.blue < this.score.red ? 'lose' : 'draw';
    const b: BattleResult['breakdown'] = [];
    const s = this.stats;
    b.push({ label: `Уничтожено противников × ${s.kills}`, xp: s.kills * 130, gold: s.kills * 6 });
    b.push({ label: `Нанесённый урон ${Math.round(s.damage)}`, xp: Math.round(s.damage * 0.09), gold: Math.round(s.damage * 0.004) });
    if (this.cfg.mode === 'capture') b.push({ label: `Захваты точек × ${s.captures}`, xp: s.captures * 90, gold: s.captures * 8 });
    b.push({ label: outcome === 'win' ? 'Победа' : outcome === 'draw' ? 'Ничья' : 'Поражение', xp: outcome === 'win' ? 420 : outcome === 'draw' ? 200 : 90, gold: outcome === 'win' ? 45 : outcome === 'draw' ? 20 : 8 });
    if (this.player.alive && this.cfg.mode === 'deathmatch') b.push({ label: 'Выживание', xp: 150, gold: 10 });
    const acc = s.shots > 0 ? s.hits / s.shots : 0;
    if (acc > 0.6 && s.shots >= 5) b.push({ label: `Точность ${Math.round(acc * 100)}%`, xp: 80, gold: 5 });
    const result: BattleResult = {
      outcome, mode: this.cfg.mode, score: { ...this.score }, kills: s.kills, damage: Math.round(s.damage), captures: s.captures, shotsFired: s.shots, shotsHit: s.hits,
      survived: this.player.alive, timeAlive: s.timeAlive,
      xp: b.reduce((a, x) => a + x.xp, 0), gold: b.reduce((a, x) => a + x.gold, 0), breakdown: b,
    };
    this.cb.onEnd(result);
  }

  // ================= Снимок для HUD =================
  private snapshot(): HudSnapshot {
    const p = this.player;
    const enemies = this.tanks.filter((t) => this.isEnemy(p, t));
    const allies = this.tanks.filter((t) => this.isAlly(p, t));
    let inPoint: string | null = null;
    for (const cp of this.world.capPoints) if (Math.hypot(cp.x - p.x, cp.z - p.z) < cp.radius) inPoint = cp.letter;
    return {
      hp: Math.round(p.hp), maxHp: p.maxHp, alive: p.alive, respawnIn: p.alive ? 0 : Math.max(0, p.respawnTimer),
      reload: p.reloadTotal > 0 ? 1 - p.reload / p.reloadTotal : 1, reloadLeft: p.reload, clip: p.clip, magazine: p.stats.magazine,
      shell: p.shell, ammo: { ...p.ammo },
      modules: { gun: p.modules.gun.hp, engine: p.modules.engine.hp, track: p.modules.track.hp, gunBroken: p.modules.gun.broken, engineBroken: p.modules.engine.broken, trackBroken: p.modules.track.broken },
      time: this.time, timeLeft: this.timeLeft, mode: this.cfg.mode, score: { ...this.score },
      enemiesAlive: enemies.filter((t) => t.alive).length, alliesAlive: allies.filter((t) => t.alive).length, enemiesTotal: enemies.length,
      points: this.world.capPoints.map((cp) => ({ letter: cp.letter, owner: cp.owner, progress: cp.progress, capturing: cp.capturing, contested: cp.contested, x: cp.x, z: cp.z })),
      notifications: this.notifications.filter((n) => this.time - n.time < 4.5),
      killfeed: this.killfeed.filter((k) => this.time - k.time < 7),
      damageFlash: this.damageFlash, damageDir: angDiff(this.damageDir, this.camYaw),
      boosts: { speed: p.boostSpeed, damage: p.boostDamage },
      speedKmh: Math.abs(p.vel) * 3.6,
      minimap: {
        player: { x: p.x, z: p.z, yaw: p.yaw, turretYaw: p.turretYaw },
        tanks: this.tanks.filter((t) => t !== p).map((t) => ({ x: t.x, z: t.z, team: this.cfg.mode === 'deathmatch' ? 1 : t.team, alive: t.alive })),
        pickups: this.world.pickups.map((pk) => ({ x: pk.x, z: pk.z, type: pk.type.id, active: pk.active })),
        destroyed: this.world.obstacles.filter((o) => !o.alive && o.kind !== 'wall' && o.kind !== 'lamp').map((o) => ({ x: o.x, z: o.z, w: o.hw * 2, d: o.hd * 2 })),
      },
      canFire: p.reload <= 0 && !p.modules.gun.broken && p.ammo[p.shell] > 0,
      aimDistance: this.aimDistance, inPoint, invuln: p.invuln, pointerLocked: this.pointerLocked, hitMarker: this.hitMarker, kills: this.stats.kills,
    };
  }

  getStaticMinimap() {
    return { obstacles: this.world.minimapObstacles, half: this.world.half };
  }

  // ================= Очистка =================
  private disposeTank(t: Tank) {
    try {
      this.scene.remove(t.model.group);
    } catch {
      /* */
    }
    try {
      disposeTankModel(t.model);
    } catch {
      /* */
    }
    try {
      t.hitbox.geometry.dispose();
      (t.hitbox.material as THREE.Material).dispose();
    } catch {
      /* */
    }
    if (t.marker) {
      try {
        this.scene.remove(t.marker);
        t.marker.geometry.dispose();
        const sm = t.marker.material as THREE.SpriteMaterial;
        sm.map?.dispose();
        sm.dispose();
      } catch {
        /* */
      }
      t.marker = null;
      t.markerTex = null;
      t.markerCtx = null;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    try {
      this.resizeObs.disconnect();
    } catch {
      /* */
    }
    try {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    } catch {
      /* */
    }
    try {
      audio.stopBattleAudio();
    } catch {
      /* */
    }
    // снаряды, ещё летящие в момент выхода
    for (const pr of this.projectiles) {
      try {
        this.scene.remove(pr.mesh);
        if (pr.light) this.scene.remove(pr.light);
      } catch {
        /* */
      }
    }
    this.projectiles.length = 0;
    for (const t of this.tanks) this.disposeTank(t);
    this.tanks.length = 0;
    for (const m of Object.values(this.shellMats)) {
      try { m.dispose(); } catch { /* */ }
    }
    for (const d of this.rubbleDisposables) {
      try { d.dispose(); } catch { /* */ }
    }
    this.rubbleDisposables.length = 0;
    try { this.particles.dispose(); } catch { /* */ }
    try { this.debris.dispose(); } catch { /* */ }
    try { this.tracks.dispose(); } catch { /* */ }
    try { this.weather?.dispose(); } catch { /* */ }
    try { this.world.dispose(); } catch { /* */ }
    this.weather = null;
    // flash-пул: гасим и убираем из сцены (геометрии у PointLight нет)
    for (const f of this.flashPool) {
      try {
        f.light.visible = false;
        f.light.intensity = 0;
        this.scene.remove(f.light);
      } catch {
        /* */
      }
    }
    this.flashPool.length = 0;
    try { this.projGeo.dispose(); } catch { /* */ }
    try { this.tracerGeo.dispose(); } catch { /* */ }
    // агрессивный traverse больше не диспоузит shared-геометрию вслепую —
    // модели уже освобождены через disposeTankModel, мир — через world.dispose()
    try { this.composer.dispose(); } catch { /* */ }
    try { this.renderer.dispose(); } catch { /* */ }
    // ВАЖНО: без forceContextLoss() — он убивает контекст canvas,
    // и повторный mount на том же элементе (StrictMode в dev / retry)
    // падает с "Cannot read properties of null (reading 'precision')".
  }
}
