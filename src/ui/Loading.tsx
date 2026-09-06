import { useEffect, useMemo, useRef, useState } from 'react';
import { BattleConfig, BIOME_NAMES, TIME_NAMES, WEATHER_NAMES, MODE_NAMES, TANKS } from '../game/config';
import { Btn, Corner } from './common';

const STEPS = ['Разведка местности', 'Генерация рельефа и построек', 'Развёртывание точек и снабжения', 'Инициализация противника', 'Калибровка прицела', 'Готовность к бою'];

export default function Loading({ cfg, ready, onDone, onCancel }: { cfg: BattleConfig; ready: boolean; onDone: () => void; onCancel?: () => void }) {
  const [p, setP] = useState(0);
  const startRef = useRef(performance.now());
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
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

  // Esc — отмена загрузки и возврат в ангар (движок.dispose вызовет размонтирование)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onCancelRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const doneCount = Math.min(STEPS.length, Math.floor(p * STEPS.length));
  const pct = Math.round(p * 100);
  return (
    <div className="absolute inset-0 bg-olive-950/70 backdrop-blur-[2px] fade-in scanlines overlay-root">
      <div className="panel p-6 sm:p-8 overlay-panel relative" role="dialog" aria-modal="true" aria-label="Загрузка операции">
        <Corner />
        <div className="panel-title">Загрузка операции</div>
        <div className="overlay-title text-olive-200 mt-1">{MODE_NAMES[cfg.mode].toUpperCase()}</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4 mono text-[11px]">
          <K k="Машина" v={TANKS[cfg.tank].name} />
          <K k="Боты" v={String(cfg.bots)} />
          <K k="Биом" v={BIOME_NAMES[cfg.biome]} />
          <K k="Время" v={TIME_NAMES[cfg.time]} />
          <K k="Погода" v={WEATHER_NAMES[cfg.weather]} />
          <K k="Сектор" v={sector} />
        </div>
        <ol className="mt-5" aria-label="Этапы загрузки">
          {STEPS.map((s, i) => {
            const done = i < doneCount;
            const current = i === doneCount && p < 1;
            return (
              <li key={s} className={`load-step ${done ? 'done' : current ? 'current' : ''}`} aria-current={current ? 'step' : undefined}>
                <span className="load-mark" aria-hidden>{done ? '✓' : current ? '▸' : '·'}</span>
                <span>{s}{current ? '…' : ''}</span>
                {done && <span className="sr-only">(готово)</span>}
              </li>
            );
          })}
        </ol>
        <div className="mt-4">
          <div className="load-lane" aria-hidden>
            <div className="load-track" />
            <div className="load-tank" style={{ left: `${Math.min(100, Math.max(0, p * 100))}%` }}>
              <TankSilhouette />
            </div>
          </div>
          <div className="flex justify-between mono text-[11px] text-olive-300 mb-1">
            <span className="uppercase tracking-wider tabular-nums" aria-live="polite">{doneCount}/{STEPS.length} · {pct}%</span>
            <span className="text-lime tabular-nums">{pct}%</span>
          </div>
          <div className="bar !h-2 relative overflow-hidden" role="progressbar" aria-label="Прогресс загрузки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: `${p * 100}%` }} />
            <div className="scan-bar" />
          </div>
        </div>
        <div className="mt-4 mono text-[11px] text-olive-400 leading-relaxed">
          Совет: {cfg.mode === 'capture' ? 'несколько танков на точке захватывают её быстрее. Попадание по захватчику прерывает захват.' : 'фугасы ломают модули и укрытия, но слабее по броне. Меняйте снаряды клавишами Q/E.'}
        </div>
        {onCancel && (
          <div className="mt-5 flex justify-end">
            <Btn onClick={onCancel} title="Прервать загрузку и вернуться в ангар (Esc)">Отмена (Esc)</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/** Упрощённый силуэт танка (вид сбоку) для полосы загрузки. */
function TankSilhouette() {
  return (
    <svg width="66" height="30" viewBox="0 0 66 30" fill="none" aria-hidden>
      <line x1="36" y1="10" x2="62" y2="7" stroke="#b9ff3d" strokeWidth="3" strokeLinecap="round" />
      <rect x="24" y="6" width="15" height="8" rx="2" fill="#1b261d" stroke="#b9ff3d" strokeWidth="1.5" />
      <path d="M8 22 L12 14 H48 L54 22 Z" fill="#1b261d" stroke="#b9ff3d" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="8" y="20" width="46" height="7" rx="3.5" fill="#0d120e" stroke="#8ea08c" strokeWidth="1.2" />
      <circle cx="18" cy="23.5" r="2" fill="#0d120e" stroke="#b9ff3d" strokeWidth="1.2" />
      <circle cx="30" cy="23.5" r="2" fill="#0d120e" stroke="#b9ff3d" strokeWidth="1.2" />
      <circle cx="42" cy="23.5" r="2" fill="#0d120e" stroke="#b9ff3d" strokeWidth="1.2" />
    </svg>
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
