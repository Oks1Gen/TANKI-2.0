import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  BattleConfig, BattleResult, EffectiveStats, ShellType, SHELLS, SHELL_ORDER, TankId, TANKS, TankSpec, Team, computeStats,
  DURATION_SECONDS, BOT_NAMES, UpgradeId,
} from './config';
import { buildTank, TankModel, wreckify } from './tankModel';
import { buildWorld, World, Obstacle, CapPoint, Pickup, mulberry } from './world';
import { ParticleSystem, DebrisSystem, TrackMarks, WeatherSystem } from './effects';
import { audio } from './audio';

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
  private camPitch = 0.18;
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
  private wreckSmoke: { x: number; z: number; t: number }[] = [];
  private engineThrottle = 0;
  private firstFrameDone = false;

  constructor(canvas: HTMLCanvasElement, cfg: BattleConfig, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 700);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.5, 0.86);
    this.composer.addPass(bloom);
    this.particles = new ParticleSystem(3500);
    this.scene.add(this.particles.points);
    this.debris = new DebrisSystem(this.scene, 70);
    this.tracks = new TrackMarks(this.scene, 500);
    this.shellMats = {
      AP: new THREE.MeshBasicMaterial({ color: SHELLS.AP.color }),
      HEAT: new THREE.MeshBasicMaterial({ color: SHELLS.HEAT.color }),
      HE: new THREE.MeshBasicMaterial({ color: SHELLS.HE.color }),
    };
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.init();
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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

    // Боты
    const rnd = mulberry(seed ^ 0x5bd1e995);
    const names = [...BOT_NAMES].sort(() => rnd() - 0.5);
    const total = this.cfg.bots + 1;
    const redCount = this.cfg.mode === 'capture' ? Math.ceil(total / 2) : this.cfg.bots;
    const ids: TankId[] = ['t34', 't100lt', 'e100'];
    for (let i = 0; i < this.cfg.bots; i++) {
      const team: Team = this.cfg.mode === 'capture' ? (i < redCount ? 1 : 0) : 1;
      const tid = ids[Math.floor(rnd() * ids.length)];
      const lvl = Math.floor(rnd() * 3);
      const botUp = { gun: lvl, engine: lvl, armor: lvl, sight: lvl, ammo: lvl, suspension: lvl } as Record<UpgradeId, number>;
      const st = computeStats(tid, botUp, false);
      const camo = this.cfg.biome === 'desert' ? 'desert' : this.cfg.biome === 'winter' ? 'winter' : this.cfg.biome === 'forest' ? 'forest' : 'base';
      const t = this.createTank(i + 1, names[i % names.length] + (i >= names.length ? '-' + (Math.floor(i / names.length) + 1) : ''), false, team, tid, st, camo);
      t.ai = { skill: 0.45 + rnd() * 0.45, target: null, retarget: rnd() * 2, state: 'wander', stateTimer: 0, moveTarget: null, strafeDir: rnd() > 0.5 ? 1 : -1, stuck: 0, unstick: 0, aimError: { x: 0, z: 0 }, errorTimer: 0, objective: null };
      this.tanks.push(t);
    }
    // Расстановка
    for (const t of this.tanks) this.spawnTank(t, true);

    // Ночь: фары
    if (this.world.env.isNight) {
      for (const t of this.tanks) {
        t.model.headlights.forEach((h) => (h.intensity = t.isPlayer ? 260 : 120));
        t.model.lightMeshes.forEach((m) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = 3));
      }
    }

    this.camYaw = this.player.yaw;
    this.player.turretYaw = this.player.yaw;
    this.bindInput();
    audio.init();
    audio.startEngine();
    audio.startAmbience(this.cfg.weather);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private createTank(id: number, name: string, isPlayer: boolean, team: Team, tid: TankId, stats: EffectiveStats, camo: BattleConfig['camo']): Tank {
    const spec = TANKS[tid];
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
      if (minEnemy < (this.cfg.mode === 'capture' ? 40 : 38) && i < 150) continue;
      t.x = x;
      t.z = z;
      found = true;
    }
    if (!found) {
      t.x = (Math.random() * 2 - 1) * 20;
      t.z = t.team === 0 ? half - 15 : -half + 15;
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
    }
  }

  private isSpotFree(x: number, z: number, r: number, self: Tank | null) {
    if (Math.abs(x) > this.world.half - r || Math.abs(z) > this.world.half - r) return false;
    for (const o of this.world.obstacles) {
      if (!o.alive && o.kind !== 'wall') continue;
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
    const sens = 0.0022;
    this.camYaw -= e.movementX * sens;
    this.camPitch = clamp(this.camPitch + e.movementY * sens * 0.8, -0.12, 0.75);
  };
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
  };

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* */
    }
  }

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('blur', this.onBlur);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
    if (dt > 0.1) dt = 0.1;
    if (!this.paused && !this.ended) {
      this.update(dt);
    } else if (this.ended && this.endTimer >= 0) {
      this.updateVisualOnly(dt);
    }
    this.updateCamera(this.paused ? 0 : dt);
    this.composer.render();
    if (!this.firstFrameDone) {
      this.firstFrameDone = true;
      this.cb.onReady();
    }
    this.hudTimer += dt;
    if (this.hudTimer > 0.08) {
      this.hudTimer = 0;
      this.cb.onHud(this.snapshot());
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
    this.updateEffectsAmbient(dt);
    this.particles.update(dt);
    this.debris.update(dt);
    this.weather?.update(dt, this.player.x, this.player.z, this.time);
    this.updateMarkers();
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 3);
    this.checkEnd(dt);
    // звук двигателя
    const sp = Math.abs(this.player.vel) / this.player.stats.speed;
    audio.setEngine(this.engineThrottle, sp, this.player.alive);
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
    if (t.boostSpeed > 0) speedMul *= 1.35;
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
      if (!o.alive || o.kind === 'wall') continue;
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
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = (a.spec.radius + b.spec.radius) * 0.85;
        if (d < min && d > 0.001) {
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
    const dmgMul = t.boostDamage > 0 ? 1.3 : 1;
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
    this.scene.remove(o.mesh);
    // обломки
    const col = o.kind === 'crate' ? 0x6a4a2a : o.kind === 'building' ? 0x7a7568 : 0x8a8a84;
    this.debris.burst(x, h * 0.3, z, o.kind === 'building' ? 14 : 6, o.kind === 'building' ? 9 : 6, col, o.kind === 'building' ? 2 : 1);
    this.particles.emit({ x, y: h * 0.4, z, vy: 4, spread: o.r * 1.5, color: 0xb0a898, life: 2.5, size: 3, grow: 6, drag: 0.6, alpha: 0.7, count: o.kind === 'building' ? 40 : 12 });
    this.particles.emit({ x, y: h * 0.4, z, vy: 6, spread: o.r, color: 0xff9040, life: 0.4, size: 3, grow: 12, count: 6 });
    // руины
    const rubble = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 1 });
    const n = o.kind === 'building' ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1 + Math.random() * o.hw, 0.5 + Math.random() * 1.2, 1 + Math.random() * o.hd), mat);
      m.position.set((Math.random() - 0.5) * o.hw * 1.4, 0.4, (Math.random() - 0.5) * o.hd * 1.4);
      m.rotation.set(Math.random() * 0.4, Math.random() * 3, Math.random() * 0.4);
      m.castShadow = true;
      rubble.add(m);
    }
    const crater = new THREE.Mesh(new THREE.CircleGeometry(o.r * 1.1, 16), new THREE.MeshBasicMaterial({ color: 0x151412, transparent: true, opacity: 0.55 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.y = 0.03;
    rubble.add(crater);
    rubble.position.set(x, 0, z);
    this.scene.add(rubble);
    o.mesh = rubble;
    const dist = Math.hypot(x - this.player.x, z - this.player.z);
    audio.explosion(o.kind === 'building' ? 1.3 : 0.6, clamp(1 - dist / 140, 0.2, 1));
    if (o.kind === 'building') this.camShake = Math.max(this.camShake, clamp(1 - dist / 60, 0, 0.8));
    if (attacker.isPlayer) this.notify(o.kind === 'building' ? 'Здание разрушено' : o.kind === 'barrier' ? 'Барьер уничтожен' : 'Ящики уничтожены', 'info');
  }

  private killTank(t: Tank, attacker: Tank) {
    t.alive = false;
    t.vel = 0;
    t.throttle = 0;
    const x = t.x, z = t.z;
    // взрыв
    this.particles.emit({ x, y: 2, z, vy: 8, spread: 10, color: 0xffa040, life: 0.7, size: 5, grow: 16, drag: 1.5, count: 24 });
    this.particles.emit({ x, y: 2, z, vy: 6, spread: 8, color: 0xff5010, life: 1.0, size: 4, grow: 8, drag: 1, count: 16 });
    this.particles.emit({ x, y: 3, z, vy: 6, spread: 6, color: 0x1a1a1a, life: 4, size: 4, grow: 6, drag: 0.5, alpha: 0.7, count: 30 });
    this.particles.emit({ x, y: 2, z, spread: 26, color: 0xffd080, life: 1.2, size: 0.8, gravity: 15, count: 40 });
    this.debris.burst(x, 2, z, 14, 12);
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
    if (this.cfg.mode === 'deathmatch') {
      t.wreck = true;
      wreckify(t.model);
      if (t.marker) t.marker.visible = false;
      this.wreckSmoke.push({ x, z, t: 25 });
    } else {
      t.model.group.visible = false;
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
    pk.respawnIn = 28;
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
        t.boostSpeed = 14;
        text = 'Форсаж: +35% скорости на 14 с';
        break;
      case 'damage':
        t.boostDamage = 14;
        text = 'Усиленный заряд: +30% урона на 14 с';
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
    const d = Math.hypot(dx, dz);
    const steps = Math.ceil(d / 2.5);
    for (let i = 1; i < steps; i++) {
      const x = ax + (dx * i) / steps;
      const z = az + (dz * i) / steps;
      for (const o of this.world.obstacles) {
        if (!o.alive || !o.blocksShots || o.kind === 'wall' || o.h < 2) continue;
        if (o.shape === 'circle') {
          if (Math.hypot(x - o.x, z - o.z) < o.r) return false;
        } else if (Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd) return false;
      }
    }
    return true;
  }

  private pathClear(x: number, z: number, dirX: number, dirZ: number, len: number, r: number) {
    const steps = Math.ceil(len / 2);
    for (let i = 1; i <= steps; i++) {
      const px = x + (dirX * len * i) / steps;
      const pz = z + (dirZ * len * i) / steps;
      if (Math.abs(px) > this.world.half - r || Math.abs(pz) > this.world.half - r) return false;
      for (const o of this.world.obstacles) {
        if (!o.alive || o.kind === 'wall') continue;
        if (Math.abs(o.x - px) > o.r + r + 1 || Math.abs(o.z - pz) > o.r + r + 1) continue;
        if (o.shape === 'circle') {
          if (Math.hypot(px - o.x, pz - o.z) < o.r + r) return false;
        } else {
          const dx = Math.max(Math.abs(px - o.x) - o.hw, 0);
          const dz = Math.max(Math.abs(pz - o.z) - o.hd, 0);
          if (Math.hypot(dx, dz) < r) return false;
        }
      }
      for (const t of this.tanks) {
        if (!t.wreck) continue;
        if (Math.hypot(px - t.x, pz - t.z) < t.spec.radius + r) return false;
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
    // ---- выбор цели ----
    if (ai.retarget <= 0 || (ai.target && !ai.target.alive)) {
      ai.retarget = 1.5 + Math.random() * 1.5;
      let best: Tank | null = null;
      let bestScore = 1e9;
      for (const e of this.tanks) {
        if (!e.alive || !this.isEnemy(t, e)) continue;
        const d = Math.hypot(e.x - t.x, e.z - t.z);
        // распределение фокуса
        let focus = 0;
        for (const o of this.tanks) if (o.ai && o.alive && this.isAlly(t, o) && o.ai.target === e) focus++;
        const threat = e.hp / e.maxHp < 0.3 ? -15 : 0;
        const los = this.hasLOS(t.x, t.z, e.x, e.z) ? 0 : 25;
        const score = d + focus * 18 + threat + los + (e.isPlayer ? -5 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      ai.target = best;
    }
    const target = ai.target;
    const distT = target ? Math.hypot(target.x - t.x, target.z - t.z) : 1e9;
    const los = target ? this.hasLOS(t.x, t.z, target.x, target.z) : false;
    const recentlyHit = this.time - t.lastHitTime < 2.5;
    const heavy = t.spec.id === 'e100';
    const light = t.spec.id === 't100lt';

    // ---- выбор состояния ----
    if (ai.stateTimer <= 0) {
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

    // ---- целевая точка движения ----
    let mt = ai.moveTarget;
    if (ai.state === 'engage' && target) {
      const minD = heavy ? 22 : light ? 18 : 26;
      const maxD = heavy ? 50 : light ? 42 : 58;
      const ang = Math.atan2(t.x - target.x, t.z - target.z);
      if (distT < minD) {
        mt = { x: target.x + Math.sin(ang) * (minD + 10), z: target.z + Math.cos(ang) * (minD + 10) };
      } else if (distT > maxD || !los) {
        mt = { x: target.x + Math.sin(ang) * (maxD - 12), z: target.z + Math.cos(ang) * (maxD - 12) };
        if (!los) {
          // обходим препятствие, смещаясь вбок
          const side = ai.strafeDir;
          mt.x += Math.cos(ang) * side * 14;
          mt.z -= Math.sin(ang) * side * 14;
        }
      } else {
        const a2 = ang + ai.strafeDir * 0.55;
        mt = { x: target.x + Math.sin(a2) * distT, z: target.z + Math.cos(a2) * distT };
      }
    } else if (ai.state === 'objective' && ai.objective) {
      const cp = ai.objective;
      const inside = Math.hypot(t.x - cp.x, t.z - cp.z) < cp.radius - 2;
      if (inside) {
        // стоим на точке, слегка перемещаясь
        if (!mt || Math.hypot(mt.x - t.x, mt.z - t.z) < 3) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * (cp.radius - 4);
          mt = { x: cp.x + Math.sin(a) * r, z: cp.z + Math.cos(a) * r };
          ai.moveTarget = mt;
        }
        // если точка наша и враг рядом — вступаем в бой
        if (target && distT < 45 && los && cp.owner === t.team) {
          ai.state = 'engage';
          ai.stateTimer = 3;
        }
      }
    } else if (!mt || Math.hypot(mt.x - t.x, mt.z - t.z) < 4) {
      mt = this.randomPoint();
      ai.moveTarget = mt;
    }

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
        const offsets = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6];
        for (const off of offsets) {
          const a = desired + off;
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
      // выбор снаряда: фугас по лёгким, ББ по остальным
      t.shell = target.spec.id === 't100lt' && Math.random() < 0.3 ? 'HE' : 'AP';
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
      if (!o.alive || o.kind === 'wall' || o.kind === 'tree' || o.h < 2.5) continue;
      const d = Math.hypot(o.x - t.x, o.z - t.z);
      if (d > 45) continue;
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
    // дым остовов
    for (const w of this.wreckSmoke) {
      w.t -= dt;
      if (w.t > 0 && Math.random() < dt * 10) {
        this.particles.emit({ x: w.x, y: 2.5, z: w.z, vy: 3, spread: 1.5, color: 0x1c1c1c, life: 3, size: 2.5, grow: 3, drag: 0.4, alpha: 0.55 });
        if (Math.random() < 0.3) this.particles.emit({ x: w.x, y: 1.8, z: w.z, vy: 2, spread: 1, color: 0xff6a20, life: 0.4, size: 1.5, grow: 2, alpha: 0.8 });
      }
    }
    this.wreckSmoke = this.wreckSmoke.filter((w) => w.t > 0);
    // гроза
    if (this.cfg.weather === 'storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 6 + Math.random() * 10;
        this.lightningFlash = 0.35;
        setTimeout(() => audio.thunder(), 300 + Math.random() * 900);
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash -= dt;
        const f = this.lightningFlash > 0 && Math.sin(this.lightningFlash * 60) > -0.3 ? 5 : 1;
        this.world.env.hemi.intensity = this.hemiBase * f;
        this.world.env.sun.intensity = f > 1 ? 3 : this.world.env.sun.intensity;
      } else this.world.env.hemi.intensity = this.hemiBase;
    }
    // солнце следует за игроком (тени)
    const sun = this.world.env.sun;
    sun.target.position.set(this.player.x, 0, this.player.z);
    const off = this.world.env.sunDir.clone().multiplyScalar(140);
    sun.position.set(this.player.x + off.x, off.y, this.player.z + off.z);
  }

  // ================= Камера =================
  private updateCamera(dt: number) {
    const p = this.player;
    const spec = p.spec;
    this.camShake = Math.max(0, this.camShake - dt * 2.2);
    this.camRecoil = Math.max(0, this.camRecoil - dt * 3);
    const dist = (spec.id === 'e100' ? 19 : spec.id === 't34' ? 16 : 14) + this.camRecoil * 1.5;
    const yaw = this.camYaw;
    const pitch = this.camPitch;
    const pivot = new THREE.Vector3(p.x, 2.5, p.z);
    const back = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.15, -Math.cos(yaw) * Math.cos(pitch)).normalize();
    const desired = pivot.clone().add(back.multiplyScalar(dist));
    // не даём камере уйти под землю
    desired.y = Math.max(desired.y, 1.5);
    // столкновение камеры с препятствиями (упрощённо)
    const toCam = desired.clone().sub(pivot);
    const len = toCam.length();
    this.raycaster.set(pivot, toCam.clone().normalize());
    this.raycaster.far = len;
    const hits = this.raycaster.intersectObjects(this.world.obstacles.filter((o) => o.alive && o.kind !== 'wall' && o.kind !== 'tree').map((o) => o.mesh), true);
    if (hits.length && hits[0].distance < len) {
      desired.copy(pivot).add(toCam.normalize().multiplyScalar(Math.max(3, hits[0].distance - 0.8)));
    }
    if (!p.alive && this.cfg.mode === 'deathmatch') {
      // орбита вокруг остова
      desired.set(p.x + Math.sin(this.time * 0.3) * 24, 10, p.z + Math.cos(this.time * 0.3) * 24);
    }
    const smooth = dt > 0 ? 1 - Math.pow(0.0001, dt) : 1;
    this.camPos.lerp(desired, this.firstFrameDone ? smooth : 1);
    const look = new THREE.Vector3(p.x + Math.sin(yaw) * 30 * Math.cos(pitch), 2.5 + 30 * -Math.sin(pitch) * 0.5 + 2, p.z + Math.cos(yaw) * 30 * Math.cos(pitch));
    if (!p.alive) look.set(p.x, 1, p.z);
    this.camLook.lerp(look, this.firstFrameDone ? Math.min(1, smooth * 1.5) : 1);
    const sh = dt > 0 ? this.camShake * this.camShake * 0.5 : 0;
    const speedShake = dt > 0 ? (Math.abs(p.vel) / p.stats.speed) * 0.03 : 0;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * (sh + speedShake), this.camPos.y + (Math.random() - 0.5) * (sh + speedShake), this.camPos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camLook);
    this.camera.rotation.z += (Math.random() - 0.5) * sh * 0.02;
    const targetFov = 62 + (Math.abs(p.vel) / p.stats.speed) * 8 + this.camRecoil * 2;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
    // точка прицела: луч из центра экрана
    if (p.alive) {
      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      this.raycaster.far = 400;
      const targets: THREE.Object3D[] = [];
      for (const o of this.world.obstacles) if (o.alive && o.kind !== 'wall') targets.push(o.mesh);
      for (const t of this.tanks) if (t !== p && (t.alive || t.wreck)) targets.push(t.hitbox);
      const hs = this.raycaster.intersectObjects(targets, true);
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
          pt = org.clone().add(dir.clone().multiplyScalar(Math.min(tg, 400)));
        } else pt = org.clone().add(dir.clone().multiplyScalar(300));
      }
      this.aimPoint.copy(pt);
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
    audio.stopBattleAudio();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
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
      },
      canFire: p.reload <= 0 && !p.modules.gun.broken && p.ammo[p.shell] > 0,
      aimDistance: this.aimDistance, inPoint, invuln: p.invuln, pointerLocked: this.pointerLocked, hitMarker: this.hitMarker, kills: this.stats.kills,
    };
  }

  getStaticMinimap() {
    return { obstacles: this.world.minimapObstacles, half: this.world.half };
  }

  // ================= Очистка =================
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    window.removeEventListener('blur', this.onBlur);
    this.resizeObs.disconnect();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    audio.stopBattleAudio();
    this.particles.dispose();
    this.debris.dispose();
    this.tracks.dispose();
    this.weather?.dispose();
    this.world.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.projGeo.dispose();
    this.tracerGeo.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
