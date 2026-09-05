// ===== Сборка сцены ангара + анимации =====
import * as THREE from 'three';
import {
  createHangarTextures,
  buildFloorPodium,
  buildStructure,
  buildGate,
  buildCrane,
  buildCrates,
  buildBarrels,
  buildShellRack,
  buildTires,
  buildWorkbench,
  buildExtinguishers,
  buildWallDecor,
  buildLamps,
  buildBackgroundTanks,
  buildWeldCorner,
  buildDust,
  buildFan,
  buildCables,
  buildInfoStand,
  updateInfoStand,
} from './props';

export interface HangarRig {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  setInfo: (title: string, rows: string[]) => void;
  dispose: () => void;
}

export function buildHangar(): HangarRig {
  const t = createHangarTextures();
  const group = new THREE.Group();

  // --- геометрия ---
  const { group: floorG, ring } = buildFloorPodium(t);
  group.add(floorG);
  group.add(buildStructure(t));
  const { group: gateG, glowPlane } = buildGate(t);
  group.add(gateG);
  const { group: craneG, hook, cable } = buildCrane(t);
  group.add(craneG);
  group.add(buildCrates(t));
  group.add(buildBarrels());
  group.add(buildShellRack());
  group.add(buildTires());
  const { group: benchG } = buildWorkbench(t);
  group.add(benchG);
  group.add(buildExtinguishers());
  group.add(buildWallDecor());
  const { group: lampG, lights: lampLights } = buildLamps(t);
  group.add(lampG);
  group.add(buildBackgroundTanks(t));
  const weld = buildWeldCorner();
  group.add(weld.group);
  const dust = buildDust();
  group.add(dust);
  const fan = buildFan();
  group.add(fan.group);
  group.add(buildCables());
  const stand = buildInfoStand();
  group.add(stand.group);

  // --- свет ---
  group.add(new THREE.HemisphereLight(0x445544, 0x0a0d0a, 0.85));
  const key = new THREE.DirectionalLight(0xfff2d8, 2.4);
  key.position.set(14, 20, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -22;
  key.shadow.camera.right = key.shadow.camera.top = 22;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  group.add(key);
  const rim = new THREE.DirectionalLight(0xb9ff3d, 0.85);
  rim.position.set(-12, 8, -14);
  group.add(rim);
  // холодный свет из ворот
  const gateSpot = new THREE.SpotLight(0xcfe0ff, 900, 60, 0.55, 0.7, 1.6);
  gateSpot.position.set(4.4, 7, -20);
  gateSpot.target.position.set(-2, 0.5, 8);
  group.add(gateSpot, gateSpot.target);
  const gateFill = new THREE.PointLight(0xcfe0ff, 60, 26, 1.8);
  gateFill.position.set(4.4, 4, -18);
  group.add(gateFill);
  // тёплый акцент на центральный танк
  const warm = new THREE.PointLight(0xffd9a0, 90, 30, 1.8);
  warm.position.set(-6, 6, 9);
  group.add(warm);

  const hookBaseX = hook.position.x;
  const hookBaseZ = hook.position.z;
  const cableBaseX = cable.position.x;
  let flickerDip = 0;

  const update = (dt: number, elapsed: number) => {
    const d = Math.min(dt, 0.05);
    ring.rotation.z += d * 0.2;
    // кран: лёгкое покачивание крюка
    const sway = Math.sin(elapsed * 0.8) * 0.28;
    hook.position.x = hookBaseX + sway;
    hook.position.z = hookBaseZ + Math.cos(elapsed * 0.62) * 0.15;
    cable.position.x = cableBaseX + sway * 0.5;
    cable.rotation.z = Math.sin(elapsed * 0.8) * 0.06;
    // вентилятор
    fan.rotor.rotation.z += d * 7;
    // пыль
    dust.rotation.y += d * 0.008;
    dust.position.y = Math.sin(elapsed * 0.3) * 0.35;
    // сварка: искры
    const pos = weld.sparks.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < weld.life.length; i++) {
      weld.life[i] -= d * 1.4;
      const ix = i * 3;
      weld.vels[ix + 1] -= 9 * d;
      arr[ix] += weld.vels[ix] * d;
      arr[ix + 1] += weld.vels[ix + 1] * d;
      arr[ix + 2] += weld.vels[ix + 2] * d;
      if (weld.life[i] <= 0 || arr[ix + 1] < 0.02) {
        arr[ix] = 0;
        arr[ix + 1] = 1.05;
        arr[ix + 2] = 0;
        weld.vels[ix] = (Math.random() - 0.5) * 4.5;
        weld.vels[ix + 1] = Math.random() * 4 + 1.5;
        weld.vels[ix + 2] = (Math.random() - 0.5) * 4.5;
        weld.life[i] = 0.4 + Math.random() * 0.8;
      }
    }
    pos.needsUpdate = true;
    // вспышки сварки
    const flash = Math.random() < 0.14;
    weld.light.intensity = flash ? 70 + Math.random() * 90 : 14 + Math.random() * 16;
    (weld.sparks.material as THREE.PointsMaterial).opacity = flash ? 1 : 0.75 + Math.random() * 0.2;
    // мерцание второй лампы
    if (flickerDip > 0) flickerDip -= d;
    else if (Math.random() < 0.008) flickerDip = 0.12;
    const base = 260 + Math.sin(elapsed * 13) * 9 + Math.sin(elapsed * 47) * 5;
    if (lampLights[1]) lampLights[1].intensity = flickerDip > 0 ? base * 0.45 : base;
    // лёгкая пульсация света из ворот (облака снаружи)
    (glowPlane.material as THREE.MeshBasicMaterial).color.setScalar(0.86 + Math.sin(elapsed * 0.4) * 0.05);
  };

  const setInfo = (title: string, rows: string[]) => updateInfoStand(stand.boardMat, title, rows);

  const dispose = () => {
    const seenTex = new Set<THREE.Texture>();
    group.traverse((o) => {
      const maybePoints = o as unknown as THREE.Points;
      if (maybePoints.isPoints) {
        const p = maybePoints;
        p.geometry.dispose();
        const m = p.material as THREE.Material;
        if (m.userData.own) {
          const sm = m as THREE.PointsMaterial;
          if (sm.map && !seenTex.has(sm.map)) {
            seenTex.add(sm.map);
            sm.map.dispose();
          }
          m.dispose();
        }
        return;
      }
      const mesh = o as unknown as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || !m.userData.own) continue;
        const sm = m as THREE.MeshStandardMaterial & { map: THREE.Texture | null; emissiveMap: THREE.Texture | null };
        if (sm.map && !seenTex.has(sm.map)) {
          seenTex.add(sm.map);
          sm.map.dispose();
        }
        if (sm.emissiveMap && !seenTex.has(sm.emissiveMap)) {
          seenTex.add(sm.emissiveMap);
          sm.emissiveMap.dispose();
        }
        // SpriteMaterial
        const spr = m as unknown as THREE.SpriteMaterial;
        if (spr.map && !seenTex.has(spr.map as THREE.Texture)) {
          seenTex.add(spr.map as THREE.Texture);
          (spr.map as THREE.Texture).dispose();
        }
        m.dispose();
      }
    });
  };

  return { group, update, setInfo, dispose };
}
