import { useEffect, useState } from 'react';
import { BattleResult, MODE_NAMES } from '../game/config';
import { getRank, getRankIndex } from '../game/ranks';
import { audio } from '../game/audio';
import { loadSettings, saveSettings } from '../game/settings';
import type { Settings } from '../game/settings';
import { Btn, Corner, fmtTime } from './common';
import RankProgress from './RankProgress';

export function PauseOverlay({ onResume, onMenu, onSettings }: { onResume: () => void; onMenu: () => void; onSettings?: (s: Settings) => void }) {
  const [muted, setMuted] = useState(() => {
    try {
      return audio.isMuted();
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onResume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResume]);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      audio.init();
      audio.setMuted(next);
    } catch { /* */ }
  };
  const [sens, setSens] = useState(() => {
    try {
      return loadSettings().sensitivity;
    } catch {
      return 1;
    }
  });
  const [vol, setVol] = useState(() => {
    try {
      return loadSettings().volume;
    } catch {
      return 0.7;
    }
  });
  const [inv, setInv] = useState(() => {
    try {
      return loadSettings().invertY;
    } catch {
      return false;
    }
  });
  const applyQuick = (patch: Partial<Settings>) => {
    try {
      const next = { ...loadSettings(), ...patch };
      saveSettings(next);
      audio.init();
      audio.setVolume(next.volume);
      onSettings?.(next);
      if (patch.sensitivity !== undefined) setSens(next.sensitivity);
      if (patch.volume !== undefined) setVol(next.volume);
      if (patch.invertY !== undefined) setInv(next.invertY);
    } catch { /* */ }
  };
  return (
    <div className="absolute inset-0 bg-olive-950/70 backdrop-blur-sm fade-in overlay-root">
      <div className="panel p-6 sm:p-8 overlay-panel relative text-center" role="dialog" aria-modal="true" aria-label="Пауза">
        <Corner />
        <div className="panel-title">Связь со штабом</div>
        <div className="overlay-title text-olive-200 mt-1">ПАУЗА</div>
        <div className="mono text-[11px] text-olive-300 mt-2">Бой приостановлен. Противник ожидает вашего решения.</div>
        <div className="flex flex-col gap-2 mt-6">
          <Btn variant="primary" onClick={onResume}>▶ Продолжить бой (Esc)</Btn>
          <Btn onClick={toggleMute}>{muted ? 'Звук: выкл — включить' : 'Звук: вкл — выключить'}</Btn>
          <Btn variant="danger" onClick={onMenu}>Вернуться в ангар</Btn>
        </div>
        <div className="mt-4 text-left">
          <div className="flex items-center gap-3">
            <span className="mono text-[11px] text-olive-300 tracking-wider uppercase w-28">Чувствительность</span>
            <input type="range" min={0.3} max={3} step={0.1} value={sens} onChange={(e) => applyQuick({ sensitivity: +e.target.value })} className="flex-1 accent-lime" aria-label="Чувствительность мыши" />
            <span className="mono text-[11px] text-lime font-bold w-10 text-right tabular-nums">{sens.toFixed(1)}×</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="mono text-[11px] text-olive-300 tracking-wider uppercase w-28">Громкость</span>
            <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => applyQuick({ volume: +e.target.value })} className="flex-1 accent-lime" aria-label="Громкость" />
            <span className="mono text-[11px] text-lime font-bold w-10 text-right tabular-nums">{Math.round(vol * 100)}%</span>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer mono text-[11px] text-olive-200">
            <input type="checkbox" checked={inv} onChange={(e) => applyQuick({ invertY: e.target.checked })} className="accent-lime w-4 h-4" />
            Инверсия мыши по вертикали
          </label>
          <div className="mono text-[11px] text-olive-400 mt-2">FOV и качество — на экране настройки боя.</div>
        </div>
        <div className="mono text-[11px] text-olive-400 mt-4 leading-relaxed">
          W/S — ход · A/D — поворот · Мышь — башня · ЛКМ/Пробел — огонь · Q/E — снаряд
        </div>
      </div>
    </div>
  );
}

export function ResultsScreen({ r, totalXp, onRetry, onMenu }: { r: BattleResult; totalXp?: number; onRetry: () => void; onMenu: () => void }) {
  const col = r.outcome === 'win' ? '#b9ff3d' : r.outcome === 'lose' ? '#ff4d4d' : '#ffb424';
  const title = r.outcome === 'win' ? 'ПОБЕДА' : r.outcome === 'lose' ? 'ПОРАЖЕНИЕ' : 'НИЧЬЯ';
  const acc = r.shotsFired > 0 ? Math.round((r.shotsHit / r.shotsFired) * 100) : 0;
  // Esc в результатах — выход в ангар (бой уже завершён, продолжать нечего)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onMenu]);
  // прогресс звания: totalXp уже включает награду боя (App.onBattleEnd),
  // «до» восстанавливаем вычитанием
  const after = Number.isFinite(totalXp) ? (totalXp as number) : null;
  const before = after !== null ? Math.max(0, after - r.xp) : null;
  const leveled = before !== null && after !== null && getRankIndex(after) > getRankIndex(before);
  const newRank = after !== null && leveled ? getRank(after) : null;
  return (
    <div className="absolute inset-0 bg-olive-950/80 backdrop-blur-sm fade-in overlay-root">
      <div className="panel p-6 sm:p-8 overlay-panel relative" style={{ borderColor: col + '66' }} role="dialog" aria-modal="true" aria-label="Результаты боя">
        <Corner />
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="panel-title">Итоги операции · {MODE_NAMES[r.mode]}</div>
            <div className="overlay-title mt-1" style={{ color: col, textShadow: `0 0 20px ${col}80` }}>{title}</div>
          </div>
          {r.mode === 'capture' && (
            <div className="mono text-center shrink-0">
              <div className="text-[11px] tracking-[0.2em] text-olive-300">СЧЁТ</div>
              <div className="text-3xl font-bold tabular-nums"><span className="text-team-blue">{r.score.blue}</span><span className="text-olive-400 mx-2">:</span><span className="text-team-red">{r.score.red}</span></div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-5 mono">
          <Stat k="УНИЧТОЖЕНО" v={String(r.kills)} />
          <Stat k="УРОН" v={String(r.damage)} />
          <Stat k="ТОЧНОСТЬ" v={`${acc}%`} sub={`${r.shotsHit}/${r.shotsFired}`} />
          {r.mode === 'capture' ? <Stat k="ЗАХВАТЫ" v={String(r.captures)} /> : <Stat k="ВЫЖИВАНИЕ" v={r.survived ? 'ДА' : 'НЕТ'} />}
          <Stat k="В БОЮ" v={fmtTime(r.timeAlive)} wide />
        </div>
        <div className="mt-5">
          <div className="panel-title mb-2">Начисление наград</div>
          <div className="reward-table mono" role="table" aria-label="Начисление наград">
            <div className="reward-row reward-head" role="row">
              <span role="columnheader">Награда</span>
              <span role="columnheader" className="reward-num">Опыт</span>
              <span role="columnheader" className="reward-num">Золото</span>
            </div>
            {r.breakdown.map((b, i) => (
              <div key={i} className="reward-row" role="row">
                <span className="text-olive-300" role="cell">{b.label}</span>
                <span className="text-lime reward-num" role="cell">+{b.xp}</span>
                <span className="text-amber reward-num" role="cell">+{b.gold}</span>
              </div>
            ))}
            <div className="reward-total" role="row">
              <span className="text-olive-200" role="cell">ИТОГО</span>
              <span className="text-lime glow-lime reward-num tabular-nums" role="cell">+{r.xp} XP</span>
              <span className="text-amber reward-num tabular-nums" role="cell">+{r.gold} ◆</span>
            </div>
          </div>
        </div>
        {after !== null && (
          <div className="mt-4 border border-olive-500/30 bg-olive-900/50 p-3 rounded-lg">
            <div className="panel-title mb-2">Звание {newRank ? `· новое: ${newRank.badge} ${newRank.name}` : ''}</div>
            <RankProgress totalXp={after} />
            {leveled && <div className="mono text-[11px] text-lime mt-1 pulse">★ ПОВЫШЕНИЕ — награда уже начислена, детали — в окне звания ★</div>}
          </div>
        )}
        <div className="flex gap-3 mt-6 justify-end flex-wrap">
          <Btn onClick={onMenu} title="Выйти в ангар (Esc)">В ангар (Esc)</Btn>
          <Btn variant="primary" onClick={onRetry}>↻ Повторить бой</Btn>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, wide }: { k: string; v: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`border border-olive-500/40 bg-olive-900/60 p-2 text-center rounded-lg ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <div className="text-[11px] tracking-[0.18em] text-olive-300">{k}</div>
      <div className="text-xl font-bold text-olive-200 leading-tight tabular-nums">{v}</div>
      {sub && <div className="text-[10px] text-olive-400 tabular-nums">{sub}</div>}
    </div>
  );
}
