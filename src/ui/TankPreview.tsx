import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TankId, CamoId } from '../game/config';
import { buildTank } from '../game/tankModel';

interface Props {
  tank: TankId;
  camo: CamoId;
  className?: string;
}

export default function TankPreview({ tank, camo, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ yaw: 0.6, pitch: 0.25, dist: 22, drag: false, lx: 0, ly: 0, auto: true });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [sceneReady, setSceneReady] = useState(0);

  // Смена модели без пересоздания рендерера
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const model = buildTank(tank, camo, 0);
    model.group.position.y = 0.4;
    model.turret.rotation.y = 0.35;
    scene.add(model.group);
    return () => {
      scene.remove(model.group);
      model.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    };
  }, [tank, camo, sceneReady]);

  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b100c, 0.02);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

    // ангар: пол и подсветка
    const floorTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d')!;
      x.fillStyle = '#141a15';
      x.fillRect(0, 0, 256, 256);
      x.strokeStyle = 'rgba(185,255,61,0.18)';
      x.lineWidth = 2;
      x.strokeRect(2, 2, 252, 252);
      x.strokeStyle = 'rgba(185,255,61,0.06)';
      for (let i = 0; i < 256; i += 32) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
        x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(10, 10);
      return t;
    })();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 0.4, 48), new THREE.MeshStandardMaterial({ color: 0x1e2a20, roughness: 0.5, metalness: 0.4 }));
    pad.position.y = 0.2;
    pad.receiveShadow = true;
    scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.2, 9.6, 64), new THREE.MeshBasicMaterial({ color: 0xb9ff3d, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.41;
    scene.add(ring);

    scene.add(new THREE.HemisphereLight(0x3a4c3a, 0x0a0d0a, 1.2));
    const key = new THREE.DirectionalLight(0xfff2d8, 3);
    key.position.set(14, 22, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -15;
    key.shadow.camera.right = key.shadow.camera.top = 15;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xb9ff3d, 1.2);
    rim.position.set(-12, 8, -14);
    scene.add(rim);
    const fill = new THREE.PointLight(0x4aa3ff, 40, 60);
    fill.position.set(-10, 6, 10);
    scene.add(fill);

    sceneRef.current = scene;

    const s = state.current;
    const onDown = (e: PointerEvent) => { s.drag = true; s.auto = false; s.lx = e.clientX; s.ly = e.clientY; canvas.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!s.drag) return;
      s.yaw += (e.clientX - s.lx) * 0.008;
      s.pitch = Math.max(0.05, Math.min(1.2, s.pitch + (e.clientY - s.ly) * 0.006));
      s.lx = e.clientX; s.ly = e.clientY;
    };
    const onUp = () => { s.drag = false; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); s.dist = Math.max(10, Math.min(40, s.dist + e.deltaY * 0.02)); };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    const resize = () => {
      const w = canvas.clientWidth || 400;
      const h = canvas.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (s.auto) s.yaw += dt * 0.25;
      camera.position.set(Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist, Math.sin(s.pitch) * s.dist + 1, Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist);
      camera.lookAt(0, 2.2, 0);
      ring.rotation.z += dt * 0.2;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    setSceneReady((v) => v + 1);
    return () => {
      sceneRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onUp);
      canvas.removeEventListener('wheel', onWheel);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />;
}
