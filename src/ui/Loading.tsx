import { useEffect, useMemo, useRef, useState } from 'react';
import { BattleConfig, BIOME_NAMES, TIME_NAMES, WEATHER_NAMES, MODE_NAMES, TANKS } from '../game/config';
import { Corner } from './common';

const STEPS = ['Разведка местности', 'Генерация рельефа и построек', 'Развёртывание точек и снабжения', 'Инициализация противника', 'Калибровка прицела', 'Готовность к бою'];

export default function Loading({ cfg, ready, onDone }: { cfg: BattleConfig; ready: boolean; onDone: () => void }) {
  const [p, setP] = useState(0);
  const startRef = useRef(performance.now());
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // номер сектора — стабилен всю загрузку, иначе flicker 60 раз/сек
  const sector = useMemo(() => `${Math.floor(Math.random() * 90 + 10)}-${cfg.biome.slice(0, 3).toUpperCase()}`, [cfg.biome]);
  useEffect(() => {
    const start = startRef.current;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastP = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      // до готовности сцены — не выше 80%
      const cap = ready ? 1 : 0.8;
      const v = Math.min(cap, t / 2.4);
      // троттлим setState — только при заметном прогрессе
      if (Math.abs(v - lastP) > 0.002 || v >= 1) {
        lastP = v;
        setP(v);
      }
      if (v >= 1 && ready) {
        if (!doneRef.current) {
          doneRef.current = true;
          timer = setTimeout(() => onDoneRef.current(), 250);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  const step = STEPS[Math.min(STEPS.length - 1, Math.floor(p * STEPS.length))];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-olive-950/70 backdrop-blur-[2px] fade-in">
      <div className="panel p-8 w-[560px] relative">
        <Corner />
        <div className="panel-title">Загрузка операции</div>
        <div className="text-3xl font-bold tracking-[0.2em] text-olive-200 mt-1 glow-lime">{MODE_NAMES[cfg.mode].toUpperCase()}</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4 mono text-[11px]">
          <K k="Машина" v={TANKS[cfg.tank].name} />
          <K k="Боты" v={String(cfg.bots)} />
          <K k="Биом" v={BIOME_NAMES[cfg.biome]} />
          <K k="Время" v={TIME_NAMES[cfg.time]} />
          <K k="Погода" v={WEATHER_NAMES[cfg.weather]} />
          <K k="Сектор" v={sector} />
        </div>
        <div className="mt-6">
          <div className="flex justify-between mono text-[10px] text-olive-300 mb-1">
            <span className="uppercase tracking-wider">{step}…</span>
            <span className="text-lime">{Math.round(p * 100)}%</span>
          </div>
          <div className="bar !h-2 relative overflow-hidden">
            <i style={{ width: `${p * 100}%` }} />
            <div className="scan-bar" />
          </div>
        </div>
        <div className="mt-4 mono text-[10px] text-olive-400 leading-relaxed">
          Совет: {cfg.mode === 'capture' ? 'несколько танков на точке захватывают её быстрее. Попадание по захватчику прерывает захват.' : 'фугасы ломают модули и укрытия, но слабее по броне. Меняйте снаряды клавишами Q/E.'}
        </div>
      </div>
    </div>
  );
}

function K({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-olive-500/20 pb-0.5">
      <span className="text-olive-400 uppercase tracking-wider text-[10px]">{k}</span>
      <span className="text-olive-200">{v}</span>
    </div>
  );
}
