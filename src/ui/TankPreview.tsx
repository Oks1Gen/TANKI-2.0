import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TankId, CamoId, TANKS } from '../game/config';
import { buildTank, TankModel, disposeTankModel } from '../game/tankModel';
import { buildHangar, HangarRig } from '../game/hangar/hangarScene';
import { getWebGLStatus } from '../game/webgl';
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

function standRows(tank: TankId): string[] {
  const s = TANKS[tank];
  return [
    `ПРОЧНОСТЬ ${s.hp}`,
    `УРОН ${s.damage} · КД ${s.reload}с`,
    `СКОРОСТЬ ${Math.round(s.speed * 3.6)} км/ч`,
    `РОЛЬ ${s.role.toUpperCase().slice(0, 22)}`,
  ];
}

function disposePreviewModel(model: TankModel) {
  try {
    disposeTankModel(model);
  } catch {
    /* */
  }
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
  const presetRef = useRef<PresetId>('overview');
  const [sceneReady, setSceneReady] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

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
    presetRef.current = id;
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
      disposePreviewModel(old);
      tankRef.current = null;
    }
    let model: TankModel | null = null;
    try {
      model = buildTank(tank, camo, 0);
    } catch (e) {
      console.error('[preview] buildTank failed', e);
      return;
    }
    model.group.position.y = 0.4;
    model.turret.rotation.y = 0.35;
    scene.add(model.group);
    tankRef.current = model;
    rig?.setInfo(TANKS[tank].name, standRows(tank));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tank, camo, sceneReady]);

  useEffect(() => {
    let canvas = canvasRef.current!;
    if (!canvas) return;
    // ранняя диагностика: если WebGL2 нет вообще — сразу понятный текст, а не исключение three.js
    try {
      const st = getWebGLStatus();
      if (!st.ok) {
        setFailed((st.error ?? 'WebGL недоступен') + (st.hint ? ' ' + st.hint : ''));
        return;
      }
    } catch {
      /* идём дальше — renderer сам бросит понятную ошибку */
    }
    // ВАЖНО: не вызываем canvas.getContext('webgl2') для проверки —
    // это создаёт контекст с дефолтными атрибутами, и последующий
    // new THREE.WebGLRenderer({ canvas, antialias: true }) получит
    // mismatch атрибутов. Проверяем WebGL через отдельный canvas
    // (getWebGLStatus выше), а битый контекст лечим retry ниже.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      // одна попытка восстановления: свежий canvas вместо отравленного
      try {
        const fresh = document.createElement('canvas');
        fresh.setAttribute('style', 'width:100%;height:100%;cursor:grab;touch-action:none');
        canvas.replaceWith(fresh);
        canvasRef.current = fresh;
        canvas = fresh;
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      } catch (e2) {
        console.error('[preview] WebGL init failed', e2);
        setFailed(e2 instanceof Error ? e2.message : 'WebGL недоступен');
        return;
      }
    }
    let rig: HangarRig;
    try {
      rig = buildHangar();
    } catch (e) {
      console.error('[preview] buildHangar failed', e);
      setFailed(e instanceof Error ? e.message : 'Не удалось построить ангар');
      try { renderer.dispose(); } catch { /* */ }
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x0b100c, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b100c, 0.013);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);

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
        } else if (s.idle > 6 && presetRef.current === 'overview') {
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
        disposePreviewModel(tankRef.current);
        tankRef.current = null;
      }
      rig.dispose();
      renderer.dispose();
      // ВАЖНО: без forceContextLoss() — он убивает контекст самого canvas,
      // и повторный mount на том же canvas (StrictMode в dev) падает с
      // "Cannot read properties of null (reading 'precision')".
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className ?? ''}`}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-olive-950/85 p-4 text-center overflow-auto">
          <div className="mono text-[11px] text-olive-300 leading-relaxed max-w-[420px]">
            3D-предпросмотр недоступен
            <br />
            <span className="text-olive-400 break-words">{failed}</span>
            <br />
            <span className="text-olive-400">Проверьте: 1) другой браузер (Chrome/Edge), 2) аппаратное ускорение включено, 3) https://get.webgl.org/ показывает куб.</span>
          </div>
        </div>
      )}
      {/* виньетка для киношности */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
      />
      {/* пресеты камеры: внизу по центру, пилюля, полупрозрачные — не спорят с названием танка */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[224px] sm:bottom-[196px] lg:bottom-[136px] flex gap-1 p-1 rounded-full border border-olive-500/30 bg-olive-950/60 backdrop-blur-md pointer-events-auto shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            onMouseEnter={() => audio.ui('hover')}
            className={`mono text-[11px] tracking-[0.15em] uppercase px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
              preset === p.id
                ? 'border-lime text-lime bg-lime/15'
                : 'border-transparent text-olive-300 hover:text-olive-200 hover:bg-olive-800/70'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
