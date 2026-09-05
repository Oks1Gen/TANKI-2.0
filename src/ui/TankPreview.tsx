import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TankId, CamoId, TANKS } from '../game/config';
import { buildTank, TankModel } from '../game/tankModel';
import { buildHangar, HangarRig } from '../game/hangar/hangarScene';
import { audio } from '../game/audio';

interface Props {
  tank: TankId;
  camo: CamoId;
  className?: string;
}

type PresetId = 'overview' | 'front' | 'side' | 'rear';

const PRESETS: { id: PresetId; label: string; yaw: number; pitch: number; dist: number; auto: boolean }[] = [
  { id: 'overview', label: 'Обзор', yaw: 0.6, pitch: 0.34, dist: 25, auto: true },
  { id: 'front', label: 'Лоб', yaw: 0.05, pitch: 0.18, dist: 17, auto: false },
  { id: 'side', label: 'Борт', yaw: Math.PI / 2, pitch: 0.22, dist: 19, auto: false },
  { id: 'rear', label: 'Корма', yaw: Math.PI, pitch: 0.3, dist: 20, auto: false },
];

function disposeTankModel(model: TankModel) {
  model.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    // материалы/текстуры камо общие (кэш) — не трогаем
  });
}

function standRows(tank: TankId): string[] {
  const s = TANKS[tank];
  return [
    `ПРОЧНОСТЬ ${s.hp}`,
    `УРОН ${s.damage} · КД ${s.reload}с`,
    `СКОРОСТЬ ${Math.round(s.speed * 3.6)} км/ч`,
    `РОЛЬ ${s.role.toUpperCase().slice(0, 22)}`,
  ];
}

export default function TankPreview({ tank, camo, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rigRef = useRef<HangarRig | null>(null);
  const tankRef = useRef<TankModel | null>(null);
  const cam = useRef({
    yaw: 0.6, pitch: 0.34, dist: 25,
    tYaw: 0.6, tPitch: 0.34, tDist: 25,
    drag: false, lx: 0, ly: 0,
    auto: true, transitioning: false, idle: 0,
  });
  const [preset, setPreset] = useState<PresetId>('overview');
  const [sceneReady, setSceneReady] = useState(0);

  const applyPreset = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const s = cam.current;
    // кратчайший путь по yaw
    let dy = (p.yaw - s.tYaw) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    s.tYaw = s.tYaw + dy;
    s.tPitch = p.pitch;
    s.tDist = p.dist;
    s.auto = p.auto;
    s.transitioning = true;
    s.idle = 0;
    setPreset(id);
    audio.ui('click');
  };

  // Смена модели танка + табличка стенда
  useEffect(() => {
    const scene = sceneRef.current;
    const rig = rigRef.current;
    if (!scene) return;
    const old = tankRef.current;
    if (old) {
      scene.remove(old.group);
      disposeTankModel(old);
      tankRef.current = null;
    }
    const model = buildTank(tank, camo, 0);
    model.group.position.y = 0.4;
    model.turret.rotation.y = 0.35;
    scene.add(model.group);
    tankRef.current = model;
    rig?.setInfo(TANKS[tank].name, standRows(tank));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tank, camo, sceneReady]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x0b100c, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b100c, 0.013);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);

    const rig = buildHangar();
    scene.add(rig.group);
    sceneRef.current = scene;
    rigRef.current = rig;

    const s = cam.current;
    const onDown = (e: PointerEvent) => {
      s.drag = true;
      s.auto = false;
      s.transitioning = false;
      s.idle = 0;
      s.lx = e.clientX;
      s.ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!s.drag) return;
      const dx = (e.clientX - s.lx) * 0.008;
      s.yaw -= dx;
      s.tYaw -= dx;
      const dp = (e.clientY - s.ly) * 0.006;
      s.pitch = Math.max(0.05, Math.min(1.2, s.pitch + dp));
      s.tPitch = s.pitch;
      s.lx = e.clientX;
      s.ly = e.clientY;
    };
    const onUp = () => {
      s.drag = false;
      s.idle = 0;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.dist = Math.max(10, Math.min(42, s.dist + e.deltaY * 0.02));
      s.tDist = s.dist;
      s.transitioning = false;
      s.idle = 0;
    };
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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now / 1000;
      rig.update(dt, elapsed);

      if (!s.drag) {
        s.idle += dt;
        if (s.transitioning) {
          const k = 1 - Math.exp(-dt * 3.2);
          s.yaw += (s.tYaw - s.yaw) * k;
          s.pitch += (s.tPitch - s.pitch) * k;
          s.dist += (s.tDist - s.dist) * k;
          if (Math.abs(s.tYaw - s.yaw) < 0.002 && Math.abs(s.tDist - s.dist) < 0.02) s.transitioning = false;
        } else if (s.auto) {
          s.yaw += dt * 0.22;
          s.tYaw = s.yaw;
        } else if (s.idle > 6 && preset === 'overview') {
          // вернулись к обзору — возобновляем вращение
          s.auto = true;
        }
      }
      camera.position.set(
        Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist,
        Math.sin(s.pitch) * s.dist + 1,
        Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist,
      );
      camera.lookAt(0, 2.4, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    setSceneReady((v) => v + 1);

    return () => {
      sceneRef.current = null;
      rigRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onUp);
      canvas.removeEventListener('wheel', onWheel);
      if (tankRef.current) {
        disposeTankModel(tankRef.current);
        tankRef.current = null;
      }
      rig.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className ?? ''}`}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />
      {/* виньетка для киношности */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
      />
      {/* пресеты камеры */}
      <div className="absolute left-1/2 -translate-x-1/2 top-3 flex gap-1 pointer-events-auto">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            onMouseEnter={() => audio.ui('hover')}
            className={`mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 border backdrop-blur-sm transition-all cursor-pointer ${
              preset === p.id
                ? 'border-lime text-lime bg-lime/10 shadow-[inset_0_0_12px_rgba(185,255,61,0.08)]'
                : 'border-olive-500/40 text-olive-300 bg-olive-900/80 hover:border-olive-300/60 hover:text-olive-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
