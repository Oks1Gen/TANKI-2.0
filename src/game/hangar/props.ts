// ===== Пропсы военного ангара: всё лоу-поли из Box/Cylinder/Torus =====
import * as THREE from 'three';
import { buildTank } from '../tankModel';
import {
  concreteFloorTexture,
  corrugatedTexture,
  darkMetalTexture,
  woodTexture,
  hazardTexture,
  tarpTexture,
  stencilTexture,
  posterTexture,
  infoBoardTexture,
  glowTexture,
} from './textures';

export interface HangarTextures {
  floor: THREE.CanvasTexture;
  corr: THREE.CanvasTexture;
  dark: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  hazard: THREE.CanvasTexture;
  tarp: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
}

export function createHangarTextures(): HangarTextures {
  const floor = concreteFloorTexture();
  const corr = corrugatedTexture();
  corr.repeat.set(10, 2);
  const dark = darkMetalTexture();
  dark.repeat.set(4, 4);
  const wood = woodTexture();
  const hazard = hazardTexture();
  hazard.repeat.set(12, 1);
  const tarp = tarpTexture();
  tarp.repeat.set(2, 2);
  const glow = glowTexture();
  return { floor, corr, dark, wood, hazard, tarp, glow };
}

function own<M extends THREE.Material>(m: M): M {
  m.userData.own = true;
  return m;
}

function std(color: number, roughness = 0.8, metalness = 0.3, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return own(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Пол + подиум с hazard-кромкой и неоновым кольцом */
export function buildFloorPodium(t: HangarTextures) {
  const g = new THREE.Group();
  const floorMat = own(new THREE.MeshStandardMaterial({ map: t.floor, roughness: 0.85, metalness: 0.2 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const padMat = std(0x232b23, 0.55, 0.45);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 0.4, 48), padMat);
  pad.position.y = 0.2;
  pad.receiveShadow = true;
  g.add(pad);

  // hazard-кромка подиума
  const hzMat = own(new THREE.MeshStandardMaterial({ map: t.hazard, roughness: 0.7, metalness: 0.2 }));
  const hz = new THREE.Mesh(new THREE.CylinderGeometry(9.55, 9.55, 0.22, 48, 1, true), hzMat);
  hz.position.y = 0.28;
  g.add(hz);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(9.7, 10.05, 64),
    own(new THREE.MeshBasicMaterial({ color: 0xb9ff3d, transparent: true, opacity: 0.55, side: THREE.DoubleSide })),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.43;
  g.add(ring);
  return { group: g, ring };
}

/** Стены, колонны, фермы крыши */
export function buildStructure(t: HangarTextures) {
  const g = new THREE.Group();
  const wallMat = own(new THREE.MeshStandardMaterial({ map: t.corr, roughness: 0.75, metalness: 0.45 }));
  const darkMat = own(new THREE.MeshStandardMaterial({ map: t.dark, roughness: 0.7, metalness: 0.5 }));
  const W = 64;
  const D = 44;
  const H = 12;
  const backZ = -D / 2;
  const sideX = W / 2;

  // задняя стена (с проёмом ворот 18x8 по центру — собираем из 3 частей)
  const gateW = 18;
  const gateH = 8;
  const sideW = (W - gateW) / 2;
  g.add(box(sideW, H, 0.6, wallMat, -(gateW / 2 + sideW / 2), H / 2, backZ));
  g.add(box(sideW, H, 0.6, wallMat, gateW / 2 + sideW / 2, H / 2, backZ));
  g.add(box(gateW, H - gateH, 0.6, wallMat, 0, gateH + (H - gateH) / 2, backZ));
  // боковые стены
  const left = box(0.6, H, D, wallMat, -sideX, H / 2, 0);
  const right = box(0.6, H, D, wallMat, sideX, H / 2, 0);
  g.add(left, right);
  // цоколь (бетонная полоса снизу)
  const baseMat = std(0x3a3f38, 0.95, 0.05);
  g.add(box(W, 1.2, 0.7, baseMat, 0, 0.6, backZ + 0.05, false));
  g.add(box(0.7, 1.2, D, baseMat, -sideX + 0.05, 0.6, 0, false));
  g.add(box(0.7, 1.2, D, baseMat, sideX - 0.05, 0.6, 0, false));

  // колонны
  for (const sx of [-1, 1]) {
    for (const z of [-16, -6, 4, 14]) {
      g.add(box(0.8, H, 0.8, darkMat, sx * (sideX - 1), H / 2, z));
      // hazard-башмак колонны
      const shoe = box(1.1, 1.0, 1.1, own(new THREE.MeshStandardMaterial({ map: t.hazard, roughness: 0.8 })), sx * (sideX - 1), 0.5, z);
      g.add(shoe);
    }
  }
  // фермы поперёк (X) + прогоны вдоль (Z)
  for (const z of [-16, -6, 4, 14]) {
    g.add(box(W - 2, 0.55, 0.55, darkMat, 0, H - 0.6, z));
    g.add(box(W - 2, 0.3, 0.3, darkMat, 0, H - 1.6, z));
    for (let x = -28; x <= 28; x += 8) {
      const diag = box(0.22, 1.3, 0.22, darkMat, x, H - 1.1, z);
      diag.rotation.z = (x % 16 === 0 ? 1 : -1) * 0.5;
      g.add(diag);
    }
  }
  for (const x of [-24, -12, 0, 12, 24]) g.add(box(0.35, 0.35, D - 2, darkMat, x, H - 0.4, 0));
  // крыша (тёмная, частично)
  const roofMat = std(0x141814, 0.95, 0.1);
  const roof = box(W, 0.3, D, roofMat, 0, H + 0.1, 0, false);
  g.add(roof);
  return g;
}

/** Ворота + яркий проём (свет снаружи) */
export function buildGate(t: HangarTextures) {
  const g = new THREE.Group();
  const backZ = -22;
  const darkMat = own(new THREE.MeshStandardMaterial({ map: t.dark, roughness: 0.6, metalness: 0.6 }));
  // рама
  g.add(box(19.5, 0.8, 1.2, darkMat, 0, 8.4, backZ + 0.3));
  g.add(box(0.8, 8.8, 1.2, darkMat, -9.4, 4.2, backZ + 0.3));
  g.add(box(0.8, 8.8, 1.2, darkMat, 9.4, 4.2, backZ + 0.3));
  // левая створка закрыта, правая сдвинута (открыто наполовину)
  const doorMat = own(new THREE.MeshStandardMaterial({ map: t.corr, roughness: 0.65, metalness: 0.55 }));
  const dl = box(8.6, 7.8, 0.35, doorMat, -4.5, 3.9, backZ + 0.3);
  const dr = box(8.6, 7.8, 0.35, doorMat, 12.5, 3.9, backZ - 0.5);
  g.add(dl, dr);
  // полосы на створках
  const hz = own(new THREE.MeshStandardMaterial({ map: t.hazard, roughness: 0.8 }));
  g.add(box(8.6, 0.7, 0.4, hz, -4.5, 0.9, backZ + 0.3, false));
  // светящийся проём
  const glowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(9.5, 7.8),
    own(new THREE.MeshBasicMaterial({ color: 0xdfe8d8 })),
  );
  glowPlane.position.set(4.4, 3.9, backZ - 0.6);
  g.add(glowPlane);
  // силуэт улицы: тёмная полоса земли + далёкие боксы
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 2.2), own(new THREE.MeshBasicMaterial({ color: 0x2c332c })));
  yard.position.set(4.4, 1.1, backZ - 0.55);
  g.add(yard);
  // трафарет над воротами
  const st = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2),
    own(new THREE.MeshBasicMaterial({ map: stencilTexture(['ВЫЕЗД'], 'rgba(201,162,39,0.9)'), transparent: true })),
  );
  st.position.set(0, 9.6, backZ + 0.65);
  g.add(st);
  return { group: g, glowPlane };
}

/** Кран-балка с крюком (крюк качается в update) */
export function buildCrane(t: HangarTextures) {
  const g = new THREE.Group();
  const darkMat = own(new THREE.MeshStandardMaterial({ map: t.dark, roughness: 0.6, metalness: 0.6 }));
  const yellow = std(0x8a7326, 0.6, 0.4);
  // подкрановые пути
  for (const sx of [-1, 1]) g.add(box(0.5, 0.5, 36, darkMat, sx * 8, 10, -3));
  // мост
  const bridge = new THREE.Group();
  bridge.add(box(17.5, 0.7, 0.9, yellow, 0, 10, -2));
  // тельфер
  bridge.add(box(1.4, 1.0, 1.2, darkMat, 2.5, 9.4, -2));
  // трос + крюк
  const cable = cyl(0.05, 0.05, 3.4, darkMat, 2.5, 7.2, -2, 6);
  const hook = box(0.5, 0.7, 0.3, yellow, 2.5, 5.3, -2);
  bridge.add(cable, hook);
  // hazard на мосту
  bridge.add(box(17.5, 0.25, 0.95, own(new THREE.MeshStandardMaterial({ map: t.hazard, roughness: 0.8 })), 0, 9.6, -2, false));
  g.add(bridge);
  return { group: g, hook, cable };
}

/** Ящики ЗИП + брезентовый штабель (левая сторона) */
export function buildCrates(t: HangarTextures) {
  const g = new THREE.Group();
  const wood = own(new THREE.MeshStandardMaterial({ map: t.wood, roughness: 0.85, metalness: 0.05 }));
  const stencil = (txt: string) =>
    own(new THREE.MeshBasicMaterial({ map: stencilTexture([txt], 'rgba(20,16,8,0.85)', 256, 128), transparent: true }));
  const crate = (w: number, h: number, d: number, x: number, y: number, z: number, label?: string, ry = 0) => {
    const grp = new THREE.Group();
    grp.add(box(w, h, d, wood, 0, 0, 0));
    // обрешётка
    grp.add(box(w + 0.06, 0.12, d + 0.06, wood, 0, h / 2 - 0.1, 0, false));
    grp.add(box(w + 0.06, 0.12, d + 0.06, wood, 0, -h / 2 + 0.1, 0, false));
    if (label) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.4), stencil(label));
      p.position.set(0, 0, d / 2 + 0.02);
      grp.add(p);
    }
    grp.position.set(x, y, z);
    grp.rotation.y = ry;
    return grp;
  };
  g.add(crate(2.6, 1.4, 1.6, -20, 0.7, -8, 'БК-12', 0.15));
  g.add(crate(2.2, 1.2, 1.4, -20.2, 2.0, -8.1, '', 0.3));
  g.add(crate(1.6, 1.6, 1.6, -17.4, 0.8, -8.4, 'МАСЛО', -0.1));
  g.add(crate(2.0, 1.0, 1.2, -22.5, 0.5, -6.2, 'ЗИП', 0.5));
  g.add(crate(1.4, 0.9, 1.0, -22.4, 1.45, -6.3, '', 0.55));
  // штабель под брезентом
  const tarpMat = own(new THREE.MeshStandardMaterial({ map: t.tarp, roughness: 0.95, metalness: 0 }));
  const pile = box(3.4, 1.8, 2.2, tarpMat, -19, 0.9, -3.5);
  pile.rotation.y = -0.2;
  g.add(pile);
  // трос поверх
  const rope = std(0x2a2419, 0.95, 0);
  g.add(box(3.5, 0.1, 0.12, rope, -19, 1.85, -3.5, false));
  return g;
}

/** Бочки на поддонах (правая сторона) */
export function buildBarrels() {
  const g = new THREE.Group();
  const cols = [0x4a5238, 0x6e3b1f, 0x2e4a5a, 0x4a5238, 0x5a5a3a, 0x6e3b1f];
  const barrelAt = (x: number, z: number, color: number, lying = false) => {
    const mat = std(color, 0.6, 0.5);
    const b = cyl(0.62, 0.62, 1.8, mat, x, lying ? 0.62 : 0.9, z, 16);
    if (lying) {
      b.rotation.z = Math.PI / 2;
      b.rotation.y = 0.3;
    }
    g.add(b);
    // рёбра
    const ribMat = std(0x1c1e1c, 0.7, 0.4);
    if (!lying) {
      g.add(box(1.3, 0.08, 1.3, ribMat, x, 0.75, z, false));
      g.add(box(1.3, 0.08, 1.3, ribMat, x, 1.15, z, false));
    }
    return b;
  };
  // поддоны
  const wood = std(0x5d4a2e, 0.9, 0.05);
  g.add(box(4.4, 0.15, 3.0, wood, 20, 0.08, -7));
  g.add(box(4.4, 0.15, 3.0, wood, 20, 0.08, -3.4));
  barrelAt(18.8, -7.4, cols[0]);
  barrelAt(20.2, -7.2, cols[1]);
  barrelAt(21.4, -7.5, cols[2]);
  barrelAt(19.4, -6.2, cols[3]);
  barrelAt(20.8, -6.1, cols[4]);
  barrelAt(20, -3.4, cols[5], true);
  barrelAt(21.2, -2.6, cols[0], true);
  return g;
}

/** Стеллаж со снарядами */
export function buildShellRack() {
  const g = new THREE.Group();
  const frame = std(0x2c332c, 0.6, 0.6);
  const brass = std(0x8a7326, 0.35, 0.8);
  const tip = std(0x3a3d3a, 0.4, 0.7);
  // стойки и полки
  for (const sx of [-1.6, 1.6]) for (const sz of [-0.5, 0.5]) g.add(box(0.15, 2.2, 0.15, frame, sx, 1.1, sz));
  g.add(box(3.5, 0.12, 1.3, frame, 0, 0.5, 0));
  g.add(box(3.5, 0.12, 1.3, frame, 0, 1.5, 0));
  g.add(box(3.5, 0.12, 1.3, frame, 0, 2.2, 0, false));
  // снаряды
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + i * 0.5;
    for (const y of [0.95, 1.95]) {
      const s = cyl(0.11, 0.13, 0.8, brass, x, y, 0, 8);
      const tp = cyl(0.02, 0.11, 0.3, tip, x, y + 0.55, 0, 8);
      g.add(s, tp);
    }
  }
  g.position.set(-25, 0, 2);
  g.rotation.y = 0.5;
  return g;
}

/** Покрышки + катки */
export function buildTires() {
  const g = new THREE.Group();
  const rubber = std(0x1e201e, 0.95, 0.05);
  const tireGeo = new THREE.TorusGeometry(0.75, 0.32, 10, 20);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(tireGeo, rubber);
    m.position.set(24, 0.35 + i * 0.62, 4);
    m.rotation.x = Math.PI / 2;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const lean = new THREE.Mesh(tireGeo, rubber);
  lean.position.set(22.4, 0.75, 5.2);
  lean.rotation.set(0.2, 0.4, 1.25);
  lean.castShadow = true;
  g.add(lean);
  // катки запасные
  const steel = std(0x3a3d36, 0.6, 0.6);
  for (let i = 0; i < 3; i++) g.add(cyl(0.55, 0.55, 0.35, steel, 26 + i * 1.3, 0.55, 5.5, 16));
  return g;
}

/** Верстак + щит с инструментами у левой стены */
export function buildWorkbench(t: HangarTextures) {
  const g = new THREE.Group();
  const wood = own(new THREE.MeshStandardMaterial({ map: t.wood, roughness: 0.85 }));
  const steel = std(0x3a3f3a, 0.5, 0.6);
  // стол
  g.add(box(3.6, 0.15, 1.4, wood, 0, 1.0, 0));
  for (const sx of [-1.6, 1.6]) for (const sz of [-0.55, 0.55]) g.add(box(0.14, 1.0, 0.14, steel, sx, 0.5, sz));
  g.add(box(3.4, 0.5, 1.1, wood, 0, 0.45, 0));
  // тиски + детали
  g.add(box(0.5, 0.35, 0.4, steel, -1.2, 1.25, 0.2));
  g.add(cyl(0.12, 0.12, 0.9, steel, 0.2, 1.15, -0.2, 8));
  g.add(box(0.7, 0.2, 0.5, std(0x6e3b1f, 0.7, 0.3), 1.1, 1.18, 0.1));
  // настольная лампа с тёплой колбой
  g.add(cyl(0.05, 0.08, 0.7, steel, 1.5, 1.4, -0.4, 6));
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 8),
    own(new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45e, emissiveIntensity: 2.4 })),
  );
  bulb.position.set(1.5, 1.8, -0.4);
  g.add(bulb);
  // щит на стене
  const peg = box(4.2, 2.0, 0.1, std(0x242a24, 0.9, 0.2), 0, 2.9, -0.85, false);
  g.add(peg);
  const toolMat = std(0x565b52, 0.45, 0.7);
  const darkTool = std(0x2a2c28, 0.6, 0.5);
  for (let i = 0; i < 6; i++) {
    const x = -1.6 + i * 0.62;
    g.add(box(0.1, 0.9, 0.06, i % 2 ? toolMat : darkTool, x, 2.9, -0.78, false));
    g.add(box(0.22, 0.16, 0.06, darkTool, x, 3.4, -0.78, false));
  }
  g.position.set(-29.5, 0, -1);
  g.rotation.y = Math.PI / 2;
  return { group: g, bulb };
}

/** Огнетушители на колоннах */
export function buildExtinguishers() {
  const g = new THREE.Group();
  const red = std(0x8a1f1a, 0.45, 0.4);
  const black = std(0x171717, 0.7, 0.3);
  for (const [x, z] of [[-31, 4], [31, -12]] as const) {
    g.add(cyl(0.22, 0.22, 0.9, red, x, 1.5, z, 12));
    g.add(cyl(0.05, 0.05, 0.3, black, x, 2.05, z, 6));
    g.add(box(0.3, 0.12, 0.12, black, x, 1.1, z, false));
  }
  return g;
}

/** Плакаты и трафареты на стенах */
export function buildWallDecor() {
  const g = new THREE.Group();
  const poster = (kind: number, w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      own(new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.9 })),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
  };
  poster(0, 2.6, 3.6, -31.6, 5.4, -11, Math.PI / 2);
  poster(1, 2.6, 3.6, 31.6, 5.2, -4, -Math.PI / 2);
  poster(2, 2.2, 3.1, -8, 5.6, -21.6, 0);
  const st1 = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    own(new THREE.MeshBasicMaterial({ map: stencilTexture(['АНГАР 01'], 'rgba(220,225,210,0.8)'), transparent: true })),
  );
  st1.position.set(-14, 8.6, -21.6);
  g.add(st1);
  const st2 = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.6),
    own(new THREE.MeshBasicMaterial({ map: stencilTexture(['ОСТОРОЖНО · ТЕХНИКА'], 'rgba(201,162,39,0.85)'), transparent: true })),
  );
  st2.position.set(31.6, 3.4, 6);
  st2.rotation.y = -Math.PI / 2;
  g.add(st2);
  return g;
}

/** Подвесные лампы (2 настоящих PointLight + 1 фейк) */
export function buildLamps(t: HangarTextures) {
  const g = new THREE.Group();
  const cordM = std(0x101010, 0.9, 0);
  const shadeM = std(0x2e3a2c, 0.5, 0.6);
  const glowM = own(new THREE.SpriteMaterial({ map: t.glow, transparent: true, opacity: 0.85, depthWrite: false }));
  const lights: THREE.PointLight[] = [];
  const bulbs: THREE.Mesh[] = [];
  const glows: THREE.Sprite[] = [];
  const spots: Array<[number, number]> = [[-10, 0], [0, -4], [10, 0]];
  spots.forEach(([x, z], i) => {
    g.add(cyl(0.04, 0.04, 2.4, cordM, x, 10.6, z, 6));
    const shade = cyl(0.25, 1.1, 0.9, shadeM, x, 9.3, z, 16);
    g.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 8),
      own(new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc06a, emissiveIntensity: 3 })),
    );
    bulb.position.set(x, 8.95, z);
    g.add(bulb);
    bulbs.push(bulb);
    const sp = new THREE.Sprite(glowM.clone());
    own(sp.material as THREE.Material);
    sp.position.set(x, 8.9, z);
    sp.scale.set(6, 6, 1);
    g.add(sp);
    glows.push(sp);
    if (i < 2) {
      const pl = new THREE.PointLight(0xffc98a, 260, 42, 1.9);
      pl.position.set(x, 8.6, z);
      g.add(pl);
      lights.push(pl);
    }
  });
  return { group: g, lights, bulbs, glows };
}

/** Фоновая техника: 2 танка в глубине, один под брезентом.
 *  Возвращает и группу, и модели — модели надо освобождать через
 *  disposeTankModel (их материалы без userData.own, общий traverse их не берёт). */
export function buildBackgroundTanks(t: HangarTextures) {
  const g = new THREE.Group();
  const left = buildTank('t34', 'forest', 0, false);
  left.group.position.set(-17.5, 0.4, -13.5);
  left.group.rotation.y = 0.55;
  left.turret.rotation.y = -0.4;
  g.add(left.group);
  const right = buildTank('e100', 'base', 0, false);
  right.group.position.set(17.5, 0.4, -14);
  right.group.rotation.y = -0.5;
  right.turret.rotation.y = 0.5;
  g.add(right.group);
  // брезент поверх правого
  const tarpMat = own(new THREE.MeshStandardMaterial({ map: t.tarp, roughness: 0.95, transparent: true, opacity: 0.96 }));
  const cover = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 9.5, 3, 2, 4), tarpMat);
  // прогиб брезента: опускаем средние вершины
  const pos = cover.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.5) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, y - Math.abs(x) * 0.12 - Math.max(0, 3 - Math.abs(z)) * 0.08);
    }
  }
  cover.geometry.computeVertexNormals();
  cover.position.set(0, 2.6, -0.4);
  cover.castShadow = true;
  right.group.add(cover);
  // козлы/подставки под левый (ремонт)
  const jackM = std(0x8a7326, 0.6, 0.4);
  const j1 = box(0.5, 1.2, 0.5, jackM, -17.5 + 2.2, 0.6, -13.5 + 2);
  const j2 = box(0.5, 1.2, 0.5, jackM, -17.5 + 2.2, 0.6, -13.5 - 2);
  g.add(j1, j2);
  return { group: g, models: [left, right] };
}

/** Сварочный угол: ширмы + искры + синий свет */
export function buildWeldCorner() {
  const g = new THREE.Group();
  const screenM = own(new THREE.MeshStandardMaterial({ color: 0xb35a1e, roughness: 0.8, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), screenM);
  s1.position.set(0, 1.3, -1.4);
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), screenM);
  s2.position.set(1.5, 1.3, 0.2);
  s2.rotation.y = Math.PI / 2.4;
  s1.castShadow = s2.castShadow = true;
  g.add(s1, s2);
  const steel = std(0x3a3d3a, 0.5, 0.6);
  g.add(box(1.6, 0.15, 0.9, steel, 0, 0.8, 0));
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.3, 0.3]) g.add(box(0.12, 0.8, 0.12, steel, sx, 0.4, sz));

  const N = 70;
  const positions = new Float32Array(N * 3);
  const vels: number[] = [];
  const life = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 1.1;
    positions[i * 3 + 2] = 0;
    vels.push((Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4);
    life[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = own(new THREE.PointsMaterial({ color: 0xffcf7a, size: 0.14, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sparks = new THREE.Points(geo, mat);
  sparks.position.set(0, 0, 0);
  sparks.frustumCulled = false;
  g.add(sparks);
  const light = new THREE.PointLight(0x7ab8ff, 30, 14, 1.8);
  light.position.set(0, 1.6, 0);
  g.add(light);
  g.position.set(25, 0, 9);
  g.rotation.y = -0.7;
  return { group: g, sparks, light, vels, life };
}

/** Пыль в лучах */
export function buildDust() {
  const N = 260;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 52;
    positions[i * 3 + 1] = 0.5 + Math.random() * 9.5;
    positions[i * 3 + 2] = -20 + Math.random() * 36;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = own(new THREE.PointsMaterial({ color: 0xfff2cf, size: 0.09, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Вентилятор на стене */
export function buildFan() {
  const g = new THREE.Group();
  const steel = std(0x2c332c, 0.5, 0.6);
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 24), steel);
  ringM.castShadow = true;
  g.add(ringM);
  const rotor = new THREE.Group();
  const bladeM = std(0x565b52, 0.45, 0.6);
  for (let i = 0; i < 3; i++) {
    const b = box(0.28, 0.95, 0.06, bladeM, 0, 0.55, 0, false);
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(b);
    rotor.add(holder);
  }
  rotor.add(cyl(0.2, 0.2, 0.25, steel, 0, 0, 0, 10));
  g.add(rotor);
  g.position.set(-31.5, 7.5, 6);
  g.rotation.y = Math.PI / 2;
  return { group: g, rotor };
}

/** Кабели по полу + катушки */
export function buildCables() {
  const g = new THREE.Group();
  const rubber = std(0x141414, 0.9, 0.1);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-26, 0.06, 8),
    new THREE.Vector3(-14, 0.06, 10.5),
    new THREE.Vector3(-4, 0.06, 9),
    new THREE.Vector3(4, 0.06, 11),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.09, 6), rubber));
  const curve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(12, 0.06, 10),
    new THREE.Vector3(18, 0.06, 8),
    new THREE.Vector3(24, 0.06, 8.6),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve2, 24, 0.07, 6), rubber));
  // катушка
  const wood = std(0x5d4a2e, 0.9, 0.05);
  const reel = new THREE.Group();
  reel.add(cyl(0.7, 0.7, 0.8, wood, 0, 0.7, 0, 14));
  reel.add(cyl(1.0, 1.0, 0.12, wood, 0, 0.25, 0, 14));
  reel.add(cyl(1.0, 1.0, 0.12, wood, 0, 1.15, 0, 14));
  reel.position.set(-26, 0, 8.6);
  reel.rotation.z = 0.15;
  g.add(reel);
  return g;
}

/** Голографический стенд ТТХ */
export function buildInfoStand() {
  const g = new THREE.Group();
  const steel = std(0x2c332c, 0.5, 0.6);
  g.add(box(0.9, 1.1, 0.5, steel, 0, 0.55, 0));
  const leg = cyl(0.07, 0.07, 0.9, steel, 0, 1.4, -0.1, 8);
  leg.rotation.x = 0.25;
  g.add(leg);
  const boardMat = own(new THREE.MeshStandardMaterial({
    map: infoBoardTexture('Т-34', ['ПРОЧНОСТЬ', 'ОРУДИЕ', 'ХОДОВАЯ']),
    roughness: 0.4,
    metalness: 0.2,
    emissive: 0xb9ff3d,
    emissiveIntensity: 0.12,
    emissiveMap: null,
  }));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), boardMat);
  board.position.set(0, 2.0, -0.25);
  board.rotation.x = -0.18;
  g.add(board);
  // подсветка стенда
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.3),
    own(new THREE.MeshBasicMaterial({ color: 0xb9ff3d, transparent: true, opacity: 0.5 })),
  );
  glow.position.set(0, 1.28, -0.05);
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);
  g.position.set(7.5, 0, 7.5);
  g.rotation.y = -0.6;
  return { group: g, boardMat };
}

/** Обновить текст стенда */
export function updateInfoStand(boardMat: THREE.MeshStandardMaterial, title: string, rows: string[]) {
  const old = boardMat.map as THREE.Texture | null;
  boardMat.map = infoBoardTexture(title, rows);
  boardMat.needsUpdate = true;
  if (old) old.dispose();
}
