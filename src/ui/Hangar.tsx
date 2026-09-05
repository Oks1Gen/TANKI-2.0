import { useState } from 'react';
import { TANKS, TANK_ORDER, TankId, UPGRADES, upgradeCost, CAMOS, CAMO_ORDER, computeStats, GameMode, MODE_NAMES, BIOME_NAMES, TIME_NAMES, WEATHER_NAMES, BattleConfig } from '../game/config';
import { Progress, cloneProgress } from '../game/progress';
import { getRank, getRankIndex, formatChatName, canUseTank, rankNameForTank, RANKS } from '../game/ranks';
import { audio } from '../game/audio';
import TankPreview from './TankPreview';
import RankBadge from './RankBadge';
import RankProgress from './RankProgress';
import { Panel, Btn, Chip, StatBar, Currency, Corner } from './common';

interface Props {
  progress: Progress;
  setProgress: (p: Progress) => void;
  setup: Pick<BattleConfig, 'mode' | 'bots' | 'botDifficulty' | 'biome' | 'time' | 'weather' | 'duration'>;
  setSetup: (s: Props['setup']) => void;
  onStart: () => void;
  onSetup: () => void;
  account: string;
  accounts: string[];
  isAdmin: boolean;
  onSwitchAccount: (name: string) => void;
  onCreateAccount: () => void;
  onDeleteAccount: () => void;
  onExportSave: () => void;
  onImportSave: (file: File) => void;
}

type Tab = 'stats' | 'upgrades' | 'camo' | 'ranks';

export default function Hangar({ progress, setProgress, setup, setSetup, onStart, onSetup, account, accounts, isAdmin, onSwitchAccount, onCreateAccount, onDeleteAccount, onExportSave, onImportSave }: Props) {
  const [tab, setTab] = useState<Tab>('stats');
  // жёсткая защита от битого прогресса — вместо белого экрана показываем фолбэк
  let sel: TankId = 't34';
  try {
    if (progress && progress.tanks && (progress.tanks as Record<string, unknown>)[progress.selectedTank]) {
      sel = progress.selectedTank;
    }
  } catch {
    sel = 't34';
  }
  const tp = progress?.tanks?.[sel] ?? { unlocked: true, upgrades: { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, goldUpgrade: false, camos: ['base'], camo: 'base' } as Progress['tanks'][TankId];
  const spec = TANKS[sel] ?? TANKS.t34;
  let stats = computeStats(sel, { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, false);
  let base = stats;
  try {
    stats = computeStats(sel, tp.upgrades ?? { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, !!tp.goldUpgrade);
  } catch {
    /* */
  }
  const safeCamo = (CAMOS as Record<string, { name: string }>)?.[tp.camo as string] ? (tp.camo as keyof typeof CAMOS) : 'base';
  const camoName = ((CAMOS as Record<string, { name: string }>)?.[safeCamo as string]?.name ?? 'Базовый').toUpperCase();
  const totalXp = Number.isFinite(progress.totalXp) ? progress.totalXp : progress.xp;
  const rank = getRank(totalXp);
  const rankLockedSel = !canUseTank(totalXp, sel);

  const selectTank = (id: TankId) => setProgress({ ...progress, selectedTank: id });

  const unlock = (id: TankId) => {
    const cost = TANKS[id].unlockXp;
    if (progress.xp < cost || !canUseTank(totalXp, id)) return audio.ui('deny');
    const p = cloneProgress(progress);
    p.xp -= cost;
    p.tanks[id].unlocked = true;
    p.selectedTank = id;
    setProgress(p);
    audio.ui('confirm');
  };

  const buyUpgrade = (uid: (typeof UPGRADES)[number]['id'], withGold: boolean) => {
    const u = UPGRADES.find((x) => x.id === uid)!;
    const lvl = tp.upgrades[uid];
    if (lvl >= u.maxLevel || !tp.unlocked) return audio.ui('deny');
    const cost = upgradeCost(u, lvl);
    const p = cloneProgress(progress);
    if (withGold) {
      const g = Math.ceil(cost / 12);
      if (p.gold < g) return audio.ui('deny');
      p.gold -= g;
    } else {
      if (p.xp < cost) return audio.ui('deny');
      p.xp -= cost;
    }
    p.tanks[sel].upgrades[uid] = lvl + 1;
    setProgress(p);
    audio.ui('confirm');
  };

  const buyGoldUpgrade = () => {
    if (tp.goldUpgrade || progress.gold < spec.goldUpgrade.cost) return audio.ui('deny');
    try {
      if (!window.confirm(`Купить «${spec.goldUpgrade.name}» за ${spec.goldUpgrade.cost} золота?`)) return;
    } catch { /* без confirm — покупаем сразу */ }
    const p = cloneProgress(progress);
    p.gold -= spec.goldUpgrade.cost;
    p.tanks[sel].goldUpgrade = true;
    setProgress(p);
    audio.ui('confirm');
  };

  const pickCamo = (c: (typeof CAMO_ORDER)[number]) => {
    const already = progress.tanks[sel]?.camos.includes(c);
    if (!already) {
      if (progress.gold < CAMOS[c].cost) return audio.ui('deny');
      try {
        if (!window.confirm(`Купить камуфляж «${CAMOS[c].name}» за ${CAMOS[c].cost} золота?`)) return;
      } catch { /* без confirm — покупаем сразу */ }
    }
    const p = cloneProgress(progress);
    if (!p.tanks[sel].camos.includes(c)) {
      if (p.gold < CAMOS[c].cost) return audio.ui('deny');
      p.gold -= CAMOS[c].cost;
      p.tanks[sel].camos.push(c);
    }
    p.tanks[sel].camo = c;
    setProgress(p);
    audio.ui(already ? 'click' : 'confirm');
  };

  return (
    <div className="w-full h-full grid-bg relative flex flex-col fade-in scanlines">
      {/* Шапка */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-lime/15 bg-olive-900/70">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 border border-lime/50 flex items-center justify-center relative">
            <Corner />
            <span className="text-lime font-bold text-xl">⊕</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-[0.25em] text-olive-200 leading-none glow-lime">СТАЛЬНОЙ ШТУРМ</h1>
            <div className="mono text-[10px] tracking-[0.3em] text-lime-dim mt-1">КОМАНДНЫЙ ПУНКТ · АНГАР 01 · ТАНКОВЫЙ ЭКШЕН</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RankBadge totalXp={totalXp} size="sm" />
          <div className="hidden xl:block w-[210px]">
            <RankProgress totalXp={totalXp} compact />
          </div>
          <span className="mono text-[10px] px-2 py-1 border tracking-[0.2em]" style={{ borderColor: rank.color + '88', color: rank.color }} title={`Префикс чата: ${rank.chatPrefix} · значок: ${rank.badge}`}>
            {rank.chatPrefix}
          </span>
          {isAdmin && <span className="mono text-[10px] px-2 py-1 border border-amber text-amber tracking-[0.25em]">АДМИН</span>}
          <select
            value={account}
            onChange={(e) => onSwitchAccount(e.target.value)}
            onMouseEnter={() => audio.ui('hover')}
            title={`Аккаунт · в чате: ${formatChatName(account, totalXp)}`}
            className="mono text-xs bg-olive-900 border border-olive-500/40 text-olive-200 px-2 py-1.5 outline-none cursor-pointer max-w-[140px]"
          >
            {accounts.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button title="Новый аккаунт" onClick={onCreateAccount} onMouseEnter={() => audio.ui('hover')} className="chip !px-2">+</button>
          {!isAdmin && <button title="Удалить аккаунт" onClick={onDeleteAccount} onMouseEnter={() => audio.ui('hover')} className="chip !px-2">×</button>}
          <button title="Скачать бэкап всех аккаунтов (JSON)" onClick={onExportSave} onMouseEnter={() => audio.ui('hover')} className="chip !px-2">⤓</button>
          <label title="Восстановить из бэкапа (JSON)" onMouseEnter={() => audio.ui('hover')} className="chip !px-2 cursor-pointer">
            ⤒
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) onImportSave(f);
              }}
            />
          </label>
        </div>
        <div className="flex items-center gap-4">
          <div className="mono text-[10px] text-olive-400 text-right leading-tight">
            <div>БОЁВ: {progress.battles ?? 0} · ПОБЕД: {progress.wins ?? 0}</div>
            <div>УНИЧТОЖЕНО: {progress.kills ?? 0}</div>
          </div>
          <Currency xp={progress.xp ?? 0} gold={progress.gold ?? 0} />
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[300px_1fr_360px] gap-4 p-4 min-h-0">
        {/* Левая колонка: выбор танка */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
          <Panel title="Боевые машины">
            <div className="flex flex-col gap-2">
              {TANK_ORDER.map((id) => {
                const t = TANKS[id];
                const pr = progress.tanks[id] ?? { unlocked: false, upgrades: { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 } };
                const active = id === sel;
                const rankOk = canUseTank(totalXp, id);
                const reqName = rankNameForTank(id);
                return (
                  <div
                    key={id}
                    onMouseEnter={() => audio.ui('hover')}
                    onClick={() => {
                      audio.init();
                      audio.ui('click');
                      selectTank(id);
                    }}
                    className={`relative p-3 cursor-pointer border transition-all ${active ? 'border-lime bg-lime/10' : 'border-olive-500/40 bg-olive-800/60 hover:border-olive-300/60'}`}
                  >
                    {active && <Corner />}
                    <div className="flex justify-between items-baseline">
                      <div className="text-xl font-bold text-olive-200">{t.name}</div>
                      <div className="mono text-[10px] text-olive-300 uppercase tracking-wider">{t.role}</div>
                    </div>
                    <div className="text-xs text-olive-300 mt-1 leading-snug">{t.desc}</div>
                    {!rankOk && (
                      <div className="mono text-[10px] text-team-red mt-2">★ ТРЕБУЕТСЯ ЗВАНИЕ: {reqName.toUpperCase()} ★</div>
                    )}
                    {!pr.unlocked ? (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="mono text-[10px] text-amber">ЗАБЛОКИРОВАН · {t.unlockXp} XP</span>
                        <Btn
                          className="!py-1 !px-2 text-[10px]"
                          disabled={progress.xp < t.unlockXp || !rankOk}
                          title={!rankOk ? `Нужно звание «${reqName}»` : undefined}
                          onClick={() => unlock(id)}
                        >
                          Открыть
                        </Btn>
                      </div>
                    ) : rankOk ? (
                      <div className="mt-2 flex gap-1">
                        {UPGRADES.map((u) => (
                          <div key={u.id} className="flex-1 h-1 bg-olive-950">
                            <div className="h-full bg-lime-dim" style={{ width: `${(pr.upgrades[u.id] / u.maxLevel) * 100}%` }} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mono text-[10px] text-team-red mt-2">НЕДОСТУПЕН ПО ЗВАНИЮ</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Управление">
            <div className="mono text-[11px] text-olive-300 space-y-1">
              <div><span className="text-lime">W / S</span> — ход вперёд / назад</div>
              <div><span className="text-lime">A / D</span> — поворот корпуса</div>
              <div><span className="text-lime">Мышь</span> — башня и прицел</div>
              <div><span className="text-lime">ЛКМ / Пробел</span> — выстрел</div>
              <div><span className="text-lime">Q / E, 1-3</span> — тип снаряда</div>
              <div><span className="text-lime">ESC</span> — пауза</div>
            </div>
          </Panel>
        </div>

        {/* Центр: 3D-предпросмотр */}
        <div className="relative panel min-h-0 overflow-hidden">
          <TankPreview tank={sel} camo={safeCamo} />
          <div className="absolute left-4 top-4 pointer-events-none">
            <div className="panel-title">Предпросмотр · вращение ЛКМ · зум колесом</div>
            <div className="text-5xl font-bold text-olive-200 mt-1 glow-lime">{spec.name}</div>
            <div className="mono text-xs text-lime tracking-[0.2em] uppercase">{spec.role}</div>
          </div>
          <div className="absolute right-4 top-4 mono text-[10px] text-olive-400 text-right pointer-events-none leading-relaxed">
            <div>КАМУФЛЯЖ: <span className="text-olive-200">{camoName}</span></div>
            <div>ОРУДИЕ: <span className="text-olive-200">{tp.goldUpgrade ? spec.goldUpgrade.name.toUpperCase() : 'ШТАТНОЕ'}</span></div>
            <div>СТАТУС: <span className={tp.unlocked && !rankLockedSel ? 'text-lime' : 'text-amber'}>{rankLockedSel ? `НУЖНО ЗВАНИЕ «${rankNameForTank(sel).toUpperCase()}»` : tp.unlocked ? 'В СТРОЮ' : 'НЕ ОТКРЫТ'}</span></div>
            <div>ЗВАНИЕ: <span style={{ color: rank.color }}>{rank.badge} {rank.name.toUpperCase()}</span></div>
          </div>
          {/* нижняя панель боя */}
          <div className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-4">
            <div className="panel p-3 flex-1">
              <div className="panel-title mb-2">Режим боя</div>
              <div className="flex gap-2 mb-3">
                {(['deathmatch', 'capture'] as GameMode[]).map((m) => (
                  <Chip key={m} active={setup.mode === m} onClick={() => setSetup({ ...setup, mode: m })}>
                    {MODE_NAMES[m]}
                  </Chip>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="mono text-[10px] text-olive-300 tracking-wider uppercase">Боты</span>
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={setup.bots}
                  onChange={(e) => setSetup({ ...setup, bots: +e.target.value })}
                  className="flex-1 accent-lime"
                />
                <span className="mono text-lime font-bold w-6 text-right">{setup.bots}</span>
              </div>
              <div className="mono text-[10px] text-olive-400 mt-2">
                {BIOME_NAMES[setup.biome]} · {TIME_NAMES[setup.time]} · {WEATHER_NAMES[setup.weather]}
                {setup.mode === 'capture' && ` · союзников: ${setup.bots - Math.ceil((setup.bots + 1) / 2)}, врагов: ${Math.ceil((setup.bots + 1) / 2)}`}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Btn onClick={onSetup}>Настройка боя</Btn>
              <Btn variant="primary" className="text-lg !py-3 !px-8" disabled={!tp.unlocked || rankLockedSel} title={rankLockedSel ? `Нужно звание «${rankNameForTank(sel)}»` : undefined} onClick={onStart}>
                ▶ Начать бой
              </Btn>
            </div>
          </div>
        </div>

        {/* Правая колонка: характеристики / прокачка / камуфляж */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="flex gap-1">
            {([['stats', 'Характеристики'], ['upgrades', 'Прокачка'], ['camo', 'Камуфляж'], ['ranks', 'Звания']] as [Tab, string][]).map(([t, l]) => (
              <Chip key={t} active={tab === t} onClick={() => setTab(t)} className="flex-1 text-center">
                {l}
              </Chip>
            ))}
          </div>
          <Panel className="flex-1 min-h-0 overflow-y-auto" title={tab === 'stats' ? 'Тактико-технические данные' : tab === 'upgrades' ? 'Модернизация' : tab === 'ranks' ? 'Звания и награды' : 'Окраска'}>
            {tab === 'ranks' && (
              <RanksTab totalXp={totalXp} />
            )}
            {tab === 'stats' && (
              <div>
                <StatBar label="Прочность" value={stats.hp} max={3200} suffix=" ед." />
                <StatBar label="Скорость" value={Math.round(stats.speed * 3.6)} max={75} suffix=" км/ч" />
                <StatBar label="Поворот корпуса" value={+(stats.hullTurn * 57.3).toFixed(0)} max={170} suffix="°/с" />
                <StatBar label="Поворот башни" value={+(stats.turretTurn * 57.3).toFixed(0)} max={230} suffix="°/с" />
                <StatBar label="Урон за выстрел" value={stats.damage} max={700} suffix=" ед." color="#ffb424" />
                <StatBar label="Перезарядка" value={+stats.reload.toFixed(1)} max={12} suffix=" с" color="#ffb424" />
                {stats.magazine > 1 && <StatBar label="Барабан" value={stats.magazine} max={4} suffix=" сн." color="#4aa3ff" />}
                <div className="mono text-[11px] text-olive-300 mt-3 grid grid-cols-3 gap-2">
                  <div className="border border-olive-500/40 p-2 text-center">
                    <div className="text-[9px] text-olive-400">ББ</div>
                    <div className="text-lime font-bold">{stats.ammo.AP}</div>
                  </div>
                  <div className="border border-olive-500/40 p-2 text-center">
                    <div className="text-[9px] text-olive-400">КС</div>
                    <div className="text-team-blue font-bold">{stats.ammo.HEAT}</div>
                  </div>
                  <div className="border border-olive-500/40 p-2 text-center">
                    <div className="text-[9px] text-olive-400">ОФ</div>
                    <div className="text-amber font-bold">{stats.ammo.HE}</div>
                  </div>
                </div>
                <div className="mono text-[10px] text-olive-400 mt-3 leading-relaxed">
                  Прирост от прокачки: прочность +{stats.hp - base.hp}, урон +{stats.damage - base.damage}, скорость +{Math.round((stats.speed - base.speed) * 3.6)} км/ч.
                </div>
                <div className="mt-3 text-xs text-olive-300 leading-snug">{spec.desc}</div>
              </div>
            )}
            {tab === 'upgrades' && (
              <div className="space-y-2">
                {!tp.unlocked && <div className="mono text-[11px] text-amber mb-2">Машина не открыта. Прокачка недоступна.</div>}
                {UPGRADES.map((u) => {
                  const lvl = tp.upgrades[u.id];
                  const max = lvl >= u.maxLevel;
                  const cost = upgradeCost(u, lvl);
                  return (
                    <div key={u.id} className="border border-olive-500/40 p-2 bg-olive-900/50">
                      <div className="flex justify-between items-baseline">
                        <div className="font-bold text-olive-200">{u.name}</div>
                        <div className="mono text-[10px] text-lime">{u.perLevel}</div>
                      </div>
                      <div className="text-[11px] text-olive-300">{u.desc}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex gap-0.5 flex-1">
                          {Array.from({ length: u.maxLevel }).map((_, i) => (
                            <div key={i} className={`h-2 flex-1 ${i < lvl ? 'bg-lime' : 'bg-olive-950 border border-olive-500/40'}`} />
                          ))}
                        </div>
                        {max ? (
                          <span className="mono text-[10px] text-lime">МАКС</span>
                        ) : (
                          <>
                            <Btn className="!py-1 !px-2 text-[10px]" disabled={!tp.unlocked || progress.xp < cost} onClick={() => buyUpgrade(u.id, false)}>
                              {cost} XP
                            </Btn>
                            <Btn className="!py-1 !px-2 text-[10px] !border-amber/50 hover:!text-amber" disabled={!tp.unlocked || progress.gold < Math.ceil(cost / 12)} onClick={() => buyUpgrade(u.id, true)} title="Ускорить за золото">
                              {Math.ceil(cost / 12)} ◆
                            </Btn>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className={`border p-3 ${tp.goldUpgrade ? 'border-amber bg-amber/10' : 'border-amber/40 bg-olive-900/50'}`}>
                  <div className="panel-title !text-amber mb-1">Особое улучшение</div>
                  <div className="font-bold text-olive-200">{spec.goldUpgrade.name}</div>
                  <div className="text-[11px] text-olive-300">{spec.goldUpgrade.desc}</div>
                  <div className="mt-2 flex justify-end">
                    {tp.goldUpgrade ? (
                      <span className="mono text-[10px] text-amber">УСТАНОВЛЕНО</span>
                    ) : (
                      <Btn className="!py-1 !px-3 text-[10px] !border-amber/60 hover:!text-amber" disabled={!tp.unlocked || progress.gold < spec.goldUpgrade.cost} onClick={buyGoldUpgrade}>
                        Купить · {spec.goldUpgrade.cost} ◆
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            )}
            {tab === 'camo' && (
              <div className="grid grid-cols-2 gap-2">
                {CAMO_ORDER.map((c) => {
                  const cs = CAMOS[c];
                  const owned = Array.isArray(tp.camos) ? tp.camos.includes(c) : c === 'base';
                  const active = tp.camo === c;
                  return (
                    <div
                      key={c}
                      onMouseEnter={() => audio.ui('hover')}
                      onClick={() => {
                        audio.init();
                        audio.ui('click');
                        pickCamo(c);
                      }}
                      className={`relative cursor-pointer border p-2 ${active ? 'border-lime bg-lime/10' : 'border-olive-500/40 bg-olive-900/50 hover:border-olive-300/60'}`}
                    >
                      {active && <Corner />}
                      <div className="h-14 w-full flex">
                        {cs.colors.map((col, i) => (
                          <div key={i} className="flex-1" style={{ background: '#' + col.toString(16).padStart(6, '0') }} />
                        ))}
                      </div>
                      <div className="flex justify-between items-baseline mt-2">
                        <span className="font-bold text-olive-200">{cs.name}</span>
                        <span className={`mono text-[10px] ${owned ? 'text-lime' : 'text-amber'}`}>{owned ? (active ? 'УСТАНОВЛЕН' : 'КУПЛЕН') : `${cs.cost} ◆`}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="col-span-2 mono text-[10px] text-olive-400 leading-relaxed mt-1">
                  Камуфляж не влияет на распознавание: союзники и враги помечаются цветными маркерами команд.
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RanksTab({ totalXp }: { totalXp: number }) {
  const cur = getRankIndex(totalXp);
  return (
    <div>
      <div className="mb-3">
        <RankProgress totalXp={totalXp} />
      </div>
      <div className="mono text-[10px] text-olive-400 mb-2 leading-relaxed">
        Прогрессия — по суммарному опыту (не сгорает при тратах). Всего {totalXp.toLocaleString('ru-RU')} XP.
      </div>
      <div className="space-y-1">
        {RANKS.map((r) => {
          const reached = r.index <= cur;
          const isCur = r.index === cur;
          return (
            <div
              key={r.id}
              className="border p-2 flex items-center gap-2"
              style={{
                borderColor: isCur ? r.color : 'rgba(142,160,140,0.25)',
                background: isCur ? r.color + '14' : reached ? 'rgba(185,255,61,0.04)' : 'rgba(13,18,14,0.6)',
                opacity: reached ? 1 : 0.75,
              }}
            >
              <span className="text-lg w-7 text-center shrink-0" style={{ color: r.color, textShadow: `0 0 8px ${r.color}` }}>
                {r.stars === 0 ? '▫' : '★'.repeat(Math.min(5, r.stars))}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-bold text-sm truncate" style={{ color: reached ? r.color : '#8ea08c' }}>
                    {isCur ? '▶ ' : ''}{r.name}
                  </span>
                  <span className="mono text-[9px] text-olive-400 shrink-0">{r.xp.toLocaleString('ru-RU')} XP</span>
                </div>
                <div className="mono text-[9px] text-olive-300 truncate">
                  {r.chatPrefix} · {r.badge} · {r.unlocks} · +{r.rewardGold} ◆
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
