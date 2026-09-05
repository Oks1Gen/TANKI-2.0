import { useEffect } from 'react';
import { RANKS } from '../game/ranks';
import { audio } from '../game/audio';
import RankBadge from './RankBadge';
import { Btn, Corner } from './common';

export interface Promotion {
  fromIdx: number;
  toIdx: number;
  bonusGold: number;
}

/** Анимация повышения: fullscreen-модалка с погоном, звёздами и наградами. */
export default function PromotionModal({ promo, totalXp, onClose }: { promo: Promotion; totalXp: number; onClose: () => void }) {
  const ranks = RANKS.slice(promo.fromIdx + 1, promo.toIdx + 1);
  const latest = RANKS[promo.toIdx];

  useEffect(() => {
    try {
      audio.init();
      audio.ui('confirm');
      const t1 = setTimeout(() => audio.pickup(), 350);
      const t2 = setTimeout(() => audio.ui('confirm'), 700);
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKey);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        window.removeEventListener('keydown', onKey);
      };
    } catch {
      /* */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-olive-950/85 backdrop-blur-sm promo-overlay" onClick={onClose}>
      <div className="panel p-8 w-[520px] relative text-center promo-card" style={{ borderColor: latest.color + '66' }} onClick={(e) => e.stopPropagation()}>
        <Corner />
        <div className="promo-flash" />
        <div className="panel-title">★ Повышение в звании ★</div>
        <div className="promo-title text-5xl font-bold tracking-[0.15em] mt-2" style={{ color: latest.color, textShadow: `0 0 28px ${latest.color}` }}>
          {latest.name.toUpperCase()}
        </div>
        <div className="mono text-[11px] text-olive-300 mt-1">
          {latest.chatPrefix} · новый значок профиля: {latest.badge}
        </div>

        <div className="flex justify-center my-5 promo-badge">
          <RankBadge totalXp={totalXp} size="lg" />
        </div>

        <div className="mono text-[11px] space-y-1 text-left border-t border-olive-500/30 pt-3">
          {ranks.map((r) => (
            <div key={r.index} className="flex justify-between border-b border-olive-500/15 pb-1 promo-row">
              <span className="text-olive-300">
                {r.badge} {r.name} <span className="text-olive-500">· {r.unlocks}</span>
              </span>
              <span className="text-amber font-bold">+{r.rewardGold} ◆</span>
            </div>
          ))}
          {ranks.length > 1 && (
            <div className="flex justify-between pt-2 text-sm font-bold">
              <span className="text-olive-200">ПРЕМИЯ ИТОГО</span>
              <span className="text-amber">+{promo.bonusGold} ◆</span>
            </div>
          )}
          {ranks.length === 1 && (
            <div className="text-olive-300">
              Открыто: <span className="text-olive-200">{ranks[0].unlocks}</span>
            </div>
          )}
        </div>

        <Btn variant="primary" className="mt-6 w-full" onClick={onClose}>
          Служу Отечеству! ▶
        </Btn>
        <div className="mono text-[9px] text-olive-500 mt-2">клик вне окна — тоже закрыть</div>
      </div>
    </div>
  );
}
