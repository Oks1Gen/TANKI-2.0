import { getRankProgress } from '../game/ranks';

/** Отображение прогресса до следующего ранга. */
export default function RankProgress({ totalXp, compact = false }: { totalXp: number; compact?: boolean }) {
  const p = getRankProgress(totalXp);
  return (
    <div className={compact ? 'min-w-[170px]' : ''} title={p.isMax ? 'Высшее звание' : `До звания «${p.next!.name}» осталось ${p.remaining.toLocaleString('ru-RU')} XP`}>
      <div className="flex justify-between items-baseline mono text-[10px]">
        <span style={{ color: p.current.color }} className="font-bold tracking-wider">
          {p.current.chatPrefix} {p.current.name.toUpperCase()}
        </span>
        {!p.isMax && <span className="text-olive-300">{p.have.toLocaleString('ru-RU')} / {p.nextXp.toLocaleString('ru-RU')}</span>}
        {p.isMax && <span className="text-amber">MAX</span>}
      </div>
      <div className="bar mt-1">
        <i
          style={{
            width: `${Math.round(p.pct * 100)}%`,
            background: `linear-gradient(90deg, ${p.current.color}88, ${p.current.color})`,
            boxShadow: `0 0 8px ${p.current.color}`,
          }}
        />
      </div>
      {!compact && (
        <div className="mono text-[10px] text-olive-400 mt-1">
          {p.isMax ? (
            <>Высшее звание «{p.current.name}» · всего {p.have.toLocaleString('ru-RU')} XP</>
          ) : (
            <>До «{p.next!.name}»: <span className="text-olive-200 font-bold">{p.remaining.toLocaleString('ru-RU')} XP</span> · {Math.round(p.pct * 100)}%</>
          )}
        </div>
      )}
    </div>
  );
}
