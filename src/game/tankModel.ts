import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TankId, TANKS, CamoId, CAMOS } from './config';

// Клон геометрии с трансформацией — для merge статических деталей (меньше draw calls)
const _te = new THREE.Euler();
const _tq = new THREE.Quaternion();
const _tp = new THREE.Vector3();
const _ts = new THREE.Vector3();
const _tm = new THREE.Matrix4();
function txg(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.BufferGeometry {
  const g = geo.clone();
  _te.set(rx, ry, rz);
  _tq.setFromEuler(_te);
  _tp.set(x, y, z);
  _ts.set(sx, sy, sz);
  _tm.compose(_tp, _tq, _ts);
  g.applyMatrix4(_tm);
  return g;
}

function tmerged(parts: THREE.BufferGeometry[], mat: THREE.Material, castShadow: boolean): THREE.Mesh | null {
  if (!parts.length) return null;
  const geo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = castShadow;
  return m;
}

export interface TankModel {
  group: THREE.Group;
  hull: THREE.Group;
  turret: THREE.Group;
  barrel: THREE.Group;
  muzzle: THREE.Object3D;
  wheels: THREE.Mesh[];
  headlights: THREE.SpotLight[];
  headCones: THREE.Mesh[];
  lightMeshes: THREE.Mesh[];
  bodyMats: THREE.MeshStandardMaterial[];
}

// Общая геометрия луча фар (одна на все танки — не создавать на каждый танк)
let sharedBeamGeo: THREE.CylinderGeometry | null = null;
function getBeamGeo(): THREE.CylinderGeometry {
  if (!sharedBeamGeo) sharedBeamGeo = new THREE.CylinderGeometry(4.2, 0.32, 28, 12, 1, true);
  // геометрия могла быть задиспоузена агрессивным traverse — пересоздаём при необходимости
  return sharedBeamGeo;
}

export function isSharedBeamGeo(g: THREE.BufferGeometry | undefined | null): boolean {
  return !!g && g === sharedBeamGeo;
}

// Сгоревший остов — один общий материал на все танки, иначе утечка на каждый kill
let sharedBurntMat: THREE.MeshStandardMaterial | null = null;
function getBurntMat(): THREE.MeshStandardMaterial {
  if (!sharedBurntMat) sharedBurntMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 1, metalness: 0.2 });
  return sharedBurntMat;
}

/** Корректное освобождение модели танка: геометрия + собственные материалы.
 *  Общую beam-геометрию и кэшированные camo-текстуры не трогаем. */
export function disposeTankModel(model: TankModel) {
  const burnt = sharedBurntMat;
  model.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m || !(m as THREE.Mesh).isMesh) return;
    const mesh = m as THREE.Mesh;
    if (mesh.geometry && !isSharedBeamGeo(mesh.geometry as THREE.BufferGeometry)) {
      try { mesh.geometry.dispose(); } catch { /* */ }
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat || mat === burnt) continue;
      const sm = mat as THREE.MeshStandardMaterial & { map?: THREE.Texture | null };
      // camo-текстуры из кэша — общие, их не диспоузим
      let isCachedTex = false;
      if (sm.map) {
        for (const cached of camoTexCache.values()) {
          if (cached === sm.map) { isCachedTex = true; break; }
        }
      }
      // beam ShaderMaterial — собственный, диспоузим
      try { mat.dispose(); } catch { /* */ }
      void isCachedTex;
    }
  });
}

// Мягкий рассеянный луч: альфа гаснет к силуэту (нет оконтовки) и к концам.
// uOpacity задаёт яркость (engine меняет через setBeamOpacity).
export function makeBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0xffdf9e) },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float ndv = abs(dot(normalize(vNormal), normalize(vViewDir)));
        float edge = pow(ndv, 1.8); // к краю конуса -> 0, оконтовки нет
        float head = smoothstep(0.0, 0.22, vUv.y); // мягкое появление у фары
        float tail = 1.0 - smoothstep(0.55, 1.0, vUv.y); // сход на нет к концу
        float a = uOpacity * edge * head * tail;
        if (a < 0.0015) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
}

export function setBeamOpacity(mesh: THREE.Mesh, v: number) {
  const m = mesh.material as THREE.ShaderMaterial;
  if (m && m.uniforms && m.uniforms.uOpacity) m.uniforms.uOpacity.value = v;
}

const camoTexCache = new Map<string, THREE.Texture>();

function camoTexture(camo: CamoId, team: number): THREE.Texture {
  const key = camo + '_' + team;
  const cached = camoTexCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const cols = CAMOS[camo].colors.map((n) => '#' + n.toString(16).padStart(6, '0'));
  ctx.fillStyle = cols[0];
  ctx.fillRect(0, 0, 256, 256);
  // случайные пятна с фиксированным зерном
  let seed = camo.length * 977 + 13;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (camo !== 'base') {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = cols[1 + Math.floor(rnd() * 2)];
      ctx.beginPath();
      const x = rnd() * 256;
      const y = rnd() * 256;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const r = 12 + rnd() * 26;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * (0.6 + rnd() * 0.6));
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // грязь/потёртости
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 1 + rnd() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  camoTexCache.set(key, tex);
  return tex;
}

export function buildTank(id: TankId, camo: CamoId, team: number, withLights = true): TankModel {
  const spec = TANKS[id];
  const { length: L, width: W, height: H, turret: TH, barrel: BL } = spec.scale;
  const group = new THREE.Group();
  const hull = new THREE.Group();
  group.add(hull);

  const tex = camoTexture(camo, team);
  const bodyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.25 });
  const bodyMat2 = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d1f1c, roughness: 0.9, metalness: 0.3 });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x262825, roughness: 0.95, metalness: 0.2 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a3d36, roughness: 0.7, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb0c0, roughness: 0.2, metalness: 0.6, emissive: 0x223344, emissiveIntensity: 0.3 });

  const trackH = H * 0.75;
  const trackW = W * 0.22;
  const groundClear = 0.45;
  const hullW = W - trackW * 2 + 0.2;
  const hullY = groundClear + trackH * 0.4;

  // ---- Гусеницы ----
  // Колёса крутятся (динамика), всё остальное статично и смержено:
  // ступицы+выхлоп+ЗИП — 1 меш, надгусеничные полки+надстройка — 1 меш (было ~20 draw calls)
  const wheels: THREE.Mesh[] = [];
  const hubParts: THREE.BufferGeometry[] = [];
  const hubGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const n = id === 'e100' ? 7 : id === 't34' ? 5 : 6;
  const wr = trackH * 0.42;
  for (const side of [-1, 1]) {
    const tx = side * (W / 2 - trackW / 2);
    const track = new THREE.Mesh(new THREE.BoxGeometry(trackW, trackH, L * 0.98), trackMat);
    track.position.set(tx, groundClear + trackH / 2, 0);
    track.castShadow = true;
    track.receiveShadow = true;
    hull.add(track);
    for (let i = 0; i < n; i++) {
      const z = -L * 0.4 + (i / (n - 1)) * L * 0.8;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, trackW * 1.08, 14), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(tx, groundClear + wr, z);
      // катки/ступицы мелкие — тени от них не видно, а в shadow-pass это ~24 draw на танк
      wheel.castShadow = false;
      hull.add(wheel);
      wheels.push(wheel);
      hubParts.push(txg(hubGeo, tx, groundClear + wr, z, 0, wr * 0.4, trackW * 1.12, wr * 0.4, 0, Math.PI / 2));
    }
  }
  hubGeo.dispose();
  // выхлопные трубы + ящик ЗИП — в тот же тёмный merge (статичны относительно корпуса)
  const exGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8);
  for (const side of [-1, 1]) {
    hubParts.push(txg(exGeo, side * W * 0.25, hullY + H * 0.8, -L * 0.5, 0, 1, 1, 1, Math.PI / 2));
  }
  exGeo.dispose();
  const zipGeo = new THREE.BoxGeometry(W * 0.3, 0.35, 0.9);
  hubParts.push(txg(zipGeo, -W * 0.3, hullY + H * 1.45, -L * 0.3));
  zipGeo.dispose();
  const hullDark = tmerged(hubParts, darkMat, false);
  if (hullDark) hull.add(hullDark);

  // ---- Корпус ----
  const body = new THREE.Mesh(new THREE.BoxGeometry(hullW, H, L), bodyMat);
  body.position.set(0, hullY + H / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  hull.add(body);
  // надгусеничные полки + верхняя надстройка — один меш (было 3 draw calls)
  const upParts: THREE.BufferGeometry[] = [];
  const fenderGeo = new THREE.BoxGeometry(trackW * 1.15, 0.12, L);
  for (const side of [-1, 1]) {
    upParts.push(txg(fenderGeo, side * (W / 2 - trackW / 2), groundClear + trackH + 0.06, 0));
  }
  fenderGeo.dispose();
  const upperGeo = new THREE.BoxGeometry(W * 0.98, H * 0.45, L * 0.7);
  upParts.push(txg(upperGeo, 0, hullY + H + H * 0.2, -L * 0.05));
  upperGeo.dispose();
  const upperMerged = tmerged(upParts, bodyMat2, true);
  if (upperMerged) hull.add(upperMerged);
  // наклонный лоб
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.25, H * 1.1), bodyMat);
  glacis.position.set(0, hullY + H * 0.95, L * 0.4);
  glacis.rotation.x = id === 't34' ? -0.95 : -0.75;
  glacis.castShadow = false;
  hull.add(glacis);
  // фары + мягкие рассеянные конусы (волюметрик без стоимости света)
  const headlights: THREE.SpotLight[] = [];
  const headCones: THREE.Mesh[] = [];
  const lightMeshes: THREE.Mesh[] = [];
  const beamGeo = getBeamGeo();
  for (const side of [-1, 1]) {
    const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.25, 10), glassMat.clone());
    lm.rotation.x = Math.PI / 2;
    lm.position.set(side * W * 0.32, hullY + H * 1.25, L * 0.48);
    hull.add(lm);
    lightMeshes.push(lm);
    // фейк-конус — всегда (дешёвый волюметрик), реальный спот — только при withLights.
    // У ботов спотов нет: ночью это минус ~24 источника света на сцену.
    const cone = new THREE.Mesh(beamGeo, makeBeamMaterial());
    cone.rotation.x = Math.PI / 2 + 0.055;
    cone.position.set(side * W * 0.32, lm.position.y - 0.7, L * 0.48 + 14);
    cone.visible = false;
    cone.renderOrder = 5;
    hull.add(cone);
    headCones.push(cone);
    if (withLights) {
      const sp = new THREE.SpotLight(0xffe9b0, 0, 75, 0.55, 0.5, 1.2);
      sp.position.copy(lm.position);
      sp.target.position.set(side * W * 0.32, 0, L * 0.5 + 30);
      hull.add(sp);
      hull.add(sp.target);
      headlights.push(sp);
    }
  }

  // ---- Башня ----
  const turret = new THREE.Group();
  const turretY = hullY + H + H * 0.42;
  turret.position.set(0, turretY, id === 'e100' ? -L * 0.05 : id === 't34' ? L * 0.05 : L * 0.02);
  group.add(turret);
  let turretMesh: THREE.Mesh;
  if (id === 'e100') {
    turretMesh = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, TH, L * 0.42), bodyMat2);
    turretMesh.position.y = TH / 2;
  } else if (id === 't34') {
    turretMesh = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.3, W * 0.37, TH, 20), bodyMat2);
    turretMesh.position.y = TH / 2;
  } else {
    turretMesh = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.26, W * 0.34, TH, 8), bodyMat2);
    turretMesh.position.y = TH / 2;
    turretMesh.rotation.y = Math.PI / 8;
  }
  turretMesh.castShadow = true;
  turret.add(turretMesh);
  // маска + люк + антенна — один тёмный меш (статичны относительно башни)
  const tdParts: THREE.BufferGeometry[] = [];
  const mantGeo = new THREE.BoxGeometry(W * 0.32, TH * 0.7, 0.6);
  tdParts.push(txg(mantGeo, 0, TH * 0.5, W * 0.32));
  mantGeo.dispose();
  const hatchGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
  tdParts.push(txg(hatchGeo, -W * 0.12, TH + 0.06, -L * 0.03));
  hatchGeo.dispose();
  const antGeo = new THREE.CylinderGeometry(0.02, 0.03, 2.6, 4);
  tdParts.push(txg(antGeo, -W * 0.25, TH + 1.3, -L * 0.1));
  antGeo.dispose();
  const turretDark = tmerged(tdParts, darkMat, false);
  if (turretDark) turret.add(turretDark);
  // командирская башенка со смотровыми приборами
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.4, 10), bodyMat);
  cupola.position.set(W * 0.16, TH + 0.2, -L * 0.06);
  turret.add(cupola);
  // 6 визиров — один меш (было 6 draw calls)
  const visParts: THREE.BufferGeometry[] = [];
  const visGeo = new THREE.BoxGeometry(0.18, 0.12, 0.06);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    visParts.push(txg(visGeo, cupola.position.x + Math.cos(a) * 0.52, cupola.position.y + 0.08, cupola.position.z + Math.sin(a) * 0.52, -a + Math.PI / 2));
  }
  visGeo.dispose();
  const visors = tmerged(visParts, glassMat, false);
  if (visors) turret.add(visors);

  // ---- Орудие ----
  const barrel = new THREE.Group();
  barrel.position.set(0, TH * 0.5, W * 0.25);
  turret.add(barrel);
  const br = id === 'e100' ? 0.26 : id === 't34' ? 0.17 : 0.14;
  // ствол + дульный тормоз — один меш (статичны относительно люльки)
  const gunParts: THREE.BufferGeometry[] = [];
  const gunGeo = new THREE.CylinderGeometry(br, br * 1.15, BL, 12);
  gunParts.push(txg(gunGeo, 0, 0, BL / 2, 0, 1, 1, 1, Math.PI / 2));
  gunGeo.dispose();
  const brakeGeo = new THREE.CylinderGeometry(br * 1.5, br * 1.5, br * 5, 12);
  gunParts.push(txg(brakeGeo, 0, 0, BL - br * 2, 0, 1, 1, 1, Math.PI / 2));
  brakeGeo.dispose();
  const gunMerged = tmerged(gunParts, darkMat, false);
  if (gunMerged) barrel.add(gunMerged);
  const muzzle = new THREE.Object3D();
  muzzle.position.z = BL + 0.2;
  barrel.add(muzzle);

  return { group, hull, turret, barrel, muzzle, wheels, headlights, headCones, lightMeshes, bodyMats: [bodyMat, bodyMat2] };
}

// Превращает модель в остов (сгоревший).
// Старые материалы диспоузим сразу, иначе каждый kill в deathmatch
// оставляет 6-8 висящих GPU-материалов (рост памяти за серию боёв).
export function wreckify(model: TankModel) {
  const burnt = getBurntMat();
  const doomed = new Set<THREE.Material>();
  model.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'hitbox') {
      const m = o as THREE.Mesh;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat && mat !== burnt) doomed.add(mat as THREE.Material);
      }
      if (m.material !== burnt) m.material = burnt;
    }
  });
  for (const mat of doomed) {
    try { mat.dispose(); } catch { /* */ }
  }
  // bodyMats больше не валидны (задиспоужены выше) — чистим, чтобы
  // disposeTankModel не пытался их трогать повторно
  model.bodyMats.length = 0;
  model.turret.rotation.z = 0.25;
  model.turret.rotation.x = -0.15;
  model.turret.position.y += 0.35;
  model.turret.position.x += 0.6;
  model.barrel.rotation.x = 0.35;
  model.hull.rotation.z = 0.06;
  model.headlights.forEach((h) => {
    h.intensity = 0;
    h.visible = false;
  });
  model.headCones.forEach((c) => {
    c.visible = false;
    setBeamOpacity(c, 0);
  });
  model.lightMeshes.forEach((m) => {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat && 'emissiveIntensity' in mat) mat.emissiveIntensity = 0.1;
  });
}
