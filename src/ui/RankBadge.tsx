import { RANKS, getRankIndex } from '../game/ranks';

/** Погон звания: уникальные звёзды/полосы для каждого ранга. Чистый CSS/SVG, без ассетов. */
export default function RankBadge({ totalXp, size = 'md', showName = false }: { totalXp: number; size?: 'sm' | 'md' | 'lg'; showName?: boolean }) {
  const idx = getRankIndex(totalXp);
  const r = RANKS[idx];
  const dims = size === 'lg' ? 'w-20 h-24' : size === 'sm' ? 'w-9 h-11' : 'w-12 h-14';
  const starSize = size === 'lg' ? 22 : size === 'sm' ? 9 : 12;
  const tierBg =
    r.tier === 'legend'
      ? 'linear-gradient(180deg,#2a1414,#131b15)'
      : r.tier === 'general'
        ? 'linear-gradient(180deg,#14202a,#131b15)'
        : r.tier === 'senior'
          ? 'linear-gradient(180deg,#2a2314,#131b15)'
          : 'linear-gradient(180deg,#1b261d,#0d120e)';

  return (
    <div className="flex items-center gap-2" title={`${r.name} · ${r.xp.toLocaleString('ru-RU')} XP`}>
      <div
        className={`${dims} relative border flex flex-col items-center justify-center overflow-hidden shrink-0`}
        style={{ borderColor: r.color + '88', background: tierBg, boxShadow: `inset 0 0 12px ${r.color}22` }}
      >
        {/* полосы / просветы */}
        {r.stripes > 0 && (
          <div className="absolute inset-y-1 flex gap-[3px] justify-center opacity-70">
            {Array.from({ length: r.stripes }).map((_, i) => (
              <div key={i} className="w-[3px] h-full" style={{ background: r.color + '55' }} />
            ))}
          </div>
        )}
        {/* звёзды */}
        <div className="relative flex flex-wrap items-center justify-center gap-[2px] px-1 max-w-full" style={{ color: r.color, textShadow: `0 0 8px ${r.color}` }}>
          {r.stars === 0 ? (
            <span className="mono text-[10px] opacity-60">—</span>
          ) : (
            Array.from({ length: r.stars }).map((_, i) => (
              <span key={i} className="rank-star" style={{ fontSize: starSize, lineHeight: 1 }}>
                ★
              </span>
            ))
          )}
        </div>
        {/* шеврон легенды */}
        {r.tier === 'legend' && r.stripes === 3 && (
          <div className="absolute bottom-[2px] mono" style={{ fontSize: 7, color: r.color }}>
            ◆◆◆
          </div>
        )}
        {size !== 'sm' && (
          <div className="absolute bottom-[1px] mono text-center w-full" style={{ fontSize: 7, letterSpacing: '0.1em', color: r.color + 'cc' }}>
            {r.index}
          </div>
        )}
      </div>
      {showName && (
        <div className="leading-tight">
          <div className="mono text-[9px] tracking-[0.2em] text-olive-400">ЗВАНИЕ</div>
          <div className="font-bold text-sm" style={{ color: r.color }}>
            {r.name}
          </div>
          <div className="mono text-[9px] text-olive-300">
            {r.chatPrefix} {r.badge}
          </div>
        </div>
      )}
    </div>
  );
}
