import { BattleResult, MODE_NAMES } from '../game/config';
import { Btn, Corner, fmtTime } from './common';

export function PauseOverlay({ onResume, onMenu }: { onResume: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-olive-950/70 backdrop-blur-sm fade-in">
      <div className="panel p-8 w-[420px] relative text-center">
        <Corner />
        <div className="panel-title">Связь со штабом</div>
        <div className="text-4xl font-bold tracking-[0.3em] text-olive-200 mt-1 glow-lime">ПАУЗА</div>
        <div className="mono text-[11px] text-olive-300 mt-2">Бой приостановлен. Противник ожидает вашего решения.</div>
        <div className="flex flex-col gap-2 mt-6">
          <Btn variant="primary" onClick={onResume}>▶ Продолжить бой</Btn>
          <Btn variant="danger" onClick={onMenu}>Вернуться в ангар</Btn>
        </div>
        <div className="mono text-[10px] text-olive-400 mt-5 leading-relaxed">
          W/S — ход · A/D — поворот · Мышь — башня · ЛКМ/Пробел — огонь · Q/E — снаряд
        </div>
      </div>
    </div>
  );
}

export function ResultsScreen({ r, onRetry, onMenu }: { r: BattleResult; onRetry: () => void; onMenu: () => void }) {
  const col = r.outcome === 'win' ? '#b9ff3d' : r.outcome === 'lose' ? '#ff4d4d' : '#ffb424';
  const title = r.outcome === 'win' ? 'ПОБЕДА' : r.outcome === 'lose' ? 'ПОРАЖЕНИЕ' : 'НИЧЬЯ';
  const acc = r.shotsFired > 0 ? Math.round((r.shotsHit / r.shotsFired) * 100) : 0;
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
