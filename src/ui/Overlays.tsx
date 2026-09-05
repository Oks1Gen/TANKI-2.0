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
    <div className="absolute inset-0 flex items-center justify-center bg-olive-950/70 backdrop-blur-sm fade-in overflow-y-auto p-4">
      <div className="panel p-8 w-[420px] relative text-center">
        <Corner />
        <div className="panel-title">Связь со штабом</div>
        <div className="text-4xl font-bold tracking-[0.3em] text-olive-200 mt-1 glow-lime">ПАУЗА</div>
        <div className="mono text-[11px] text-olive-300 mt-2">Бой приостановлен. Противник ожидает вашего решения.</div>
        <div className="flex flex-col gap-2 mt-6">
          <Btn variant="primary" onClick={onResume}>▶ Продолжить бой (Esc)</Btn>
          <Btn onClick={toggleMute}>{muted ? '🔇 Звук выкл — включить' : '🔊 Звук вкл — выключить'}</Btn>
          <Btn variant="danger" onClick={onMenu}>Вернуться в ангар</Btn>
        </div>
        <div className="mt-4 text-left">
          <div className="flex items-center gap-3">
            <span className="mono text-[10px] text-olive-300 tracking-wider uppercase w-28">Чувствительность</span>
            <input type="range" min={0.3} max={3} step={0.1} value={sens} onChange={(e) => applyQuick({ sensitivity: +e.target.value })} className="flex-1 accent-lime" />
            <span className="mono text-lime font-bold w-10 text-right">{sens.toFixed(1)}×</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="mono text-[10px] text-olive-300 tracking-wider uppercase w-28">Громкость</span>
            <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => applyQuick({ volume: +e.target.value })} className="flex-1 accent-lime" />
            <span className="mono text-lime font-bold w-10 text-right">{Math.round(vol * 100)}%</span>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer mono text-[11px] text-olive-200">
            <input type="checkbox" checked={inv} onChange={(e) => applyQuick({ invertY: e.target.checked })} className="accent-lime w-4 h-4" />
            Инверсия мыши по вертикали
          </label>
          <div className="mono text-[10px] text-olive-400 mt-2">FOV и качество — на экране настройки боя.</div>
        </div>
        <div className="mono text-[10px] text-olive-400 mt-4 leading-relaxed">
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
  // прогресс звания: totalXp уже включает награду боя (App.onBattleEnd),
  // «до» восстанавливаем вычитанием
  const after = Number.isFinite(totalXp) ? (totalXp as number) : null;
  const before = after !== null ? Math.max(0, after - r.xp) : null;
  const leveled = before !== null && after !== null && getRankIndex(after) > getRankIndex(before);
  const newRank = after !== null && leveled ? getRank(after) : null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-olive-950/80 backdrop-blur-sm fade-in">
      <div className="panel p-8 w-[680px] relative" style={{ borderColor: col + '66' }}>
        <Corner />
        <div className="flex justify-between items-start">
          <div>
            <div className="panel-title">Итоги операции · {MODE_NAMES[r.mode]}</div>
            <div className="text-5xl font-bold tracking-[0.3em] mt-1" style={{ color: col, textShadow: `0 0 20px ${col}80` }}>{title}</div>
          </div>
          {r.mode === 'capture' && (
            <div className="mono text-center">
              <div className="text-[9px] tracking-[0.2em] text-olive-300">СЧЁТ</div>
              <div className="text-3xl font-bold"><span className="text-team-blue">{r.score.blue}</span><span className="text-olive-400 mx-2">:</span><span className="text-team-red">{r.score.red}</span></div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2 mt-5 mono">
          <Stat k="УНИЧТОЖЕНО" v={String(r.kills)} />
          <Stat k="УРОН" v={String(r.damage)} />
          <Stat k="ТОЧНОСТЬ" v={`${acc}%`} sub={`${r.shotsHit}/${r.shotsFired}`} />
          {r.mode === 'capture' ? <Stat k="ЗАХВАТЫ" v={String(r.captures)} /> : <Stat k="ВЫЖИВАНИЕ" v={r.survived ? 'ДА' : 'НЕТ'} />}
          <Stat k="В БОЮ" v={fmtTime(r.timeAlive)} />
        </div>
        <div className="mt-5 border-t border-olive-500/30 pt-3">
          <div className="panel-title mb-2">Начисление наград</div>
          <div className="mono text-[12px] space-y-1">
            {r.breakdown.map((b, i) => (
              <div key={i} className="flex justify-between border-b border-olive-500/15 pb-1">
                <span className="text-olive-300">{b.label}</span>
                <span><span className="text-lime">+{b.xp} XP</span><span className="text-olive-500 mx-2">·</span><span className="text-amber">+{b.gold} ◆</span></span>
              </div>
            ))}
            <div className="flex justify-between pt-2 text-base font-bold">
              <span className="text-olive-200">ИТОГО</span>
              <span><span className="text-lime glow-lime">+{r.xp} XP</span><span className="text-olive-500 mx-2">·</span><span className="text-amber">+{r.gold} ◆</span></span>
            </div>
          </div>
        </div>
        {after !== null && (
          <div className="mt-4 border border-olive-500/30 bg-olive-900/50 p-3">
            <div className="panel-title mb-2">Звание {newRank ? `· новое: ${newRank.badge} ${newRank.name}` : ''}</div>
            <RankProgress totalXp={after} />
            {leveled && <div className="mono text-[10px] text-lime mt-1 pulse">★ ПОВЫШЕНИЕ — награда уже начислена, детали — в окне звания ★</div>}
          </div>
        )}
        <div className="flex gap-3 mt-6 justify-end">
          <Btn onClick={onMenu}>В ангар</Btn>
          <Btn variant="primary" onClick={onRetry}>↻ Повторить бой</Btn>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="border border-olive-500/40 bg-olive-900/60 p-2 text-center">
      <div className="text-[9px] tracking-[0.2em] text-olive-300">{k}</div>
      <div className="text-xl font-bold text-olive-200 leading-tight">{v}</div>
      {sub && <div className="text-[9px] text-olive-400">{sub}</div>}
    </div>
  );
}
