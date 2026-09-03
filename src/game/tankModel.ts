import * as THREE from 'three';
import { TankId, TANKS, CamoId, CAMOS } from './config';

export interface TankModel {
  group: THREE.Group;
  hull: THREE.Group;
  turret: THREE.Group;
  barrel: THREE.Group;
  muzzle: THREE.Object3D;
  wheels: THREE.Mesh[];
  headlights: THREE.SpotLight[];
  lightMeshes: THREE.Mesh[];
  bodyMats: THREE.MeshStandardMaterial[];
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

  // ---- Гусеницы ----
  const wheels: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const tx = side * (W / 2 - trackW / 2);
    const track = new THREE.Mesh(new THREE.BoxGeometry(trackW, trackH, L * 0.98), trackMat);
    track.position.set(tx, groundClear + trackH / 2, 0);
    track.castShadow = true;
    track.receiveShadow = true;
    hull.add(track);
    // защитный экран сверху
    const fender = new THREE.Mesh(new THREE.BoxGeometry(trackW * 1.15, 0.12, L), bodyMat2);
    fender.position.set(tx, groundClear + trackH + 0.06, 0);
    hull.add(fender);
    // катки
    const n = id === 'e100' ? 7 : id === 't34' ? 5 : 6;
    const wr = trackH * 0.42;
    for (let i = 0; i < n; i++) {
      const z = -L * 0.4 + (i / (n - 1)) * L * 0.8;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, trackW * 1.08, 14), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(tx, groundClear + wr, z);
      wheel.castShadow = true;
      hull.add(wheel);
      wheels.push(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.4, wr * 0.4, trackW * 1.12, 8), darkMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      hull.add(hub);
    }
  }

  // ---- Корпус ----
  const hullW = W - trackW * 2 + 0.2;
  const hullY = groundClear + trackH * 0.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(hullW, H, L), bodyMat);
  body.position.set(0, hullY + H / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  hull.add(body);
  // верхняя надстройка / лобовая плита
  const upperGeo = new THREE.BoxGeometry(W * 0.98, H * 0.45, L * 0.7);
  const upper = new THREE.Mesh(upperGeo, bodyMat2);
  upper.position.set(0, hullY + H + H * 0.2, -L * 0.05);
  upper.castShadow = true;
  hull.add(upper);
  // наклонный лоб
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.25, H * 1.1), bodyMat);
  glacis.position.set(0, hullY + H * 0.95, L * 0.4);
  glacis.rotation.x = id === 't34' ? -0.95 : -0.75;
  glacis.castShadow = true;
  hull.add(glacis);
  // фары
  const headlights: THREE.SpotLight[] = [];
  const lightMeshes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.25, 10), glassMat.clone());
    lm.rotation.x = Math.PI / 2;
    lm.position.set(side * W * 0.32, hullY + H * 1.25, L * 0.48);
    hull.add(lm);
    lightMeshes.push(lm);
    if (withLights) {
      const sp = new THREE.SpotLight(0xffe9b0, 0, 70, 0.55, 0.5, 1.2);
      sp.position.copy(lm.position);
      sp.target.position.set(side * W * 0.32, 0, L * 0.5 + 30);
      hull.add(sp);
      hull.add(sp.target);
      headlights.push(sp);
    }
  }
  // выхлоп
  for (const side of [-1, 1]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), darkMat);
    ex.rotation.x = Math.PI / 2;
    ex.position.set(side * W * 0.25, hullY + H * 0.8, -L * 0.5);
    hull.add(ex);
  }
  // ящики ЗИП
  const box = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.35, 0.9), darkMat);
  box.position.set(-W * 0.3, hullY + H * 1.45, -L * 0.3);
  hull.add(box);

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
  // маска орудия
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(W * 0.32, TH * 0.7, 0.6), darkMat);
  mantlet.position.set(0, TH * 0.5, W * 0.32);
  turret.add(mantlet);
  // люк
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12), darkMat);
  hatch.position.set(-W * 0.12, TH + 0.06, -L * 0.03);
  turret.add(hatch);
  // командирская башенка со смотровыми приборами
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.4, 10), bodyMat);
  cupola.position.set(W * 0.16, TH + 0.2, -L * 0.06);
  turret.add(cupola);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), glassMat);
    vis.position.set(cupola.position.x + Math.cos(a) * 0.52, cupola.position.y + 0.08, cupola.position.z + Math.sin(a) * 0.52);
    vis.rotation.y = -a + Math.PI / 2;
    turret.add(vis);
  }
  // антенна
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.6, 4), darkMat);
  ant.position.set(-W * 0.25, TH + 1.3, -L * 0.1);
  turret.add(ant);

  // ---- Орудие ----
  const barrel = new THREE.Group();
  barrel.position.set(0, TH * 0.5, W * 0.25);
  turret.add(barrel);
  const br = id === 'e100' ? 0.26 : id === 't34' ? 0.17 : 0.14;
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(br, br * 1.15, BL, 12), darkMat);
  gun.rotation.x = Math.PI / 2;
  gun.position.z = BL / 2;
  gun.castShadow = true;
  barrel.add(gun);
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(br * 1.5, br * 1.5, br * 5, 12), darkMat);
  brake.rotation.x = Math.PI / 2;
  brake.position.z = BL - br * 2;
  barrel.add(brake);
  const muzzle = new THREE.Object3D();
  muzzle.position.z = BL + 0.2;
  barrel.add(muzzle);

  return { group, hull, turret, barrel, muzzle, wheels, headlights, lightMeshes, bodyMats: [bodyMat, bodyMat2] };
}

// Превращает модель в остов (сгоревший)
export function wreckify(model: TankModel) {
  const burnt = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 1, metalness: 0.2 });
  model.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'hitbox') {
      const m = o as THREE.Mesh;
      if (m.material !== burnt) m.material = burnt;
    }
  });
  model.turret.rotation.z = 0.25;
  model.turret.rotation.x = -0.15;
  model.turret.position.y += 0.35;
  model.turret.position.x += 0.6;
  model.barrel.rotation.x = 0.35;
  model.hull.rotation.z = 0.06;
  model.headlights.forEach((h) => (h.intensity = 0));
}
