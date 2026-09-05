import { useState } from 'react';
import { TANKS, TANK_ORDER, TankId, UPGRADES, upgradeCost, CAMOS, CAMO_ORDER, computeStats, GameMode, MODE_NAMES, BIOME_NAMES, TIME_NAMES, WEATHER_NAMES, BattleConfig } from '../game/config';
import { Progress } from '../game/progress';
import { audio } from '../game/audio';
import TankPreview from './TankPreview';
import { Panel, Btn, Chip, StatBar, Currency, Corner } from './common';

interface Props {
  progress: Progress;
  setProgress: (p: Progress) => void;
  setup: Pick<BattleConfig, 'mode' | 'bots' | 'biome' | 'time' | 'weather' | 'duration'>;
  setSetup: (s: Props['setup']) => void;
  onStart: () => void;
  onSetup: () => void;
  account: string;
  accounts: string[];
  isAdmin: boolean;
  onSwitchAccount: (name: string) => void;
  onCreateAccount: () => void;
  onDeleteAccount: () => void;
}

type Tab = 'stats' | 'upgrades' | 'camo';

export default function Hangar({ progress, setProgress, setup, setSetup, onStart, onSetup, account, accounts, isAdmin, onSwitchAccount, onCreateAccount, onDeleteAccount }: Props) {
  const [tab, setTab] = useState<Tab>('stats');
  const sel = progress.selectedTank;
  const tp = progress.tanks[sel];
  const spec = TANKS[sel];
  const stats = computeStats(sel, tp.upgrades, tp.goldUpgrade);
  const base = computeStats(sel, { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, false);

  const selectTank = (id: TankId) => setProgress({ ...progress, selectedTank: id });

  const unlock = (id: TankId) => {
    const cost = TANKS[id].unlockXp;
    if (progress.xp < cost) return audio.ui('deny');
    const p = structuredClone(progress);
    p.xp -= cost;
    p.tanks[id].unlocked = true;
    p.selectedTank = id;
    setProgress(p);
  };

  const buyUpgrade = (uid: (typeof UPGRADES)[number]['id'], withGold: boolean) => {
    const u = UPGRADES.find((x) => x.id === uid)!;
    const lvl = tp.upgrades[uid];
    if (lvl >= u.maxLevel || !tp.unlocked) return audio.ui('deny');
    const cost = upgradeCost(u, lvl);
    const p = structuredClone(progress);
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
  };

  const buyGoldUpgrade = () => {
    if (tp.goldUpgrade || progress.gold < spec.goldUpgrade.cost) return audio.ui('deny');
    const p = structuredClone(progress);
    p.gold -= spec.goldUpgrade.cost;
    p.tanks[sel].goldUpgrade = true;
    setProgress(p);
  };

  const pickCamo = (c: (typeof CAMO_ORDER)[number]) => {
    const p = structuredClone(progress);
    if (!p.tanks[sel].camos.includes(c)) {
      if (p.gold < CAMOS[c].cost) return audio.ui('deny');
      p.gold -= CAMOS[c].cost;
      p.tanks[sel].camos.push(c);
    }
    p.tanks[sel].camo = c;
    setProgress(p);
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
          {isAdmin && <span className="mono text-[10px] px-2 py-1 border border-amber text-amber tracking-[0.25em]">АДМИН</span>}
          <select
            value={account}
            onChange={(e) => onSwitchAccount(e.target.value)}
            onMouseEnter={() => audio.ui('hover')}
            title="Аккаунт"
            className="mono text-xs bg-olive-900 border border-olive-500/40 text-olive-200 px-2 py-1.5 outline-none cursor-pointer max-w-[140px]"
          >
            {accounts.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button title="Новый аккаунт" onClick={onCreateAccount} onMouseEnter={() => audio.ui('hover')} className="chip !px-2">+</button>
          {!isAdmin && <button title="Удалить аккаунт" onClick={onDeleteAccount} onMouseEnter={() => audio.ui('hover')} className="chip !px-2">×</button>}
        </div>
        <div className="flex items-center gap-4">
          <div className="mono text-[10px] text-olive-400 text-right leading-tight">
            <div>БОЁВ: {progress.battles} · ПОБЕД: {progress.wins}</div>
            <div>УНИЧТОЖЕНО: {progress.kills}</div>
          </div>
          <Currency xp={progress.xp} gold={progress.gold} />
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[300px_1fr_360px] gap-4 p-4 min-h-0">
        {/* Левая колонка: выбор танка */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
          <Panel title="Боевые машины">
            <div className="flex flex-col gap-2">
              {TANK_ORDER.map((id) => {
                const t = TANKS[id];
                const pr = progress.tanks[id];
                const active = id === sel;
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
                    {!pr.unlocked ? (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="mono text-[10px] text-amber">ЗАБЛОКИРОВАН · {t.unlockXp} XP</span>
                        <Btn
                          className="!py-1 !px-2 text-[10px]"
                          disabled={progress.xp < t.unlockXp}
                          onClick={() => unlock(id)}
                        >
                          Открыть
                        </Btn>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-1">
                        {UPGRADES.map((u) => (
                          <div key={u.id} className="flex-1 h-1 bg-olive-950">
                            <div className="h-full bg-lime-dim" style={{ width: `${(pr.upgrades[u.id] / u.maxLevel) * 100}%` }} />
                          </div>
                        ))}
                      </div>
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
          <TankPreview tank={sel} camo={tp.camo} />
          <div className="absolute left-4 top-4 pointer-events-none">
            <div className="panel-title">Предпросмотр · вращение ЛКМ · зум колесом</div>
            <div className="text-5xl font-bold text-olive-200 mt-1 glow-lime">{spec.name}</div>
            <div className="mono text-xs text-lime tracking-[0.2em] uppercase">{spec.role}</div>
          </div>
          <div className="absolute right-4 top-4 mono text-[10px] text-olive-400 text-right pointer-events-none leading-relaxed">
            <div>КАМУФЛЯЖ: <span className="text-olive-200">{CAMOS[tp.camo].name.toUpperCase()}</span></div>
            <div>ОРУДИЕ: <span className="text-olive-200">{tp.goldUpgrade ? spec.goldUpgrade.name.toUpperCase() : 'ШТАТНОЕ'}</span></div>
            <div>СТАТУС: <span className={tp.unlocked ? 'text-lime' : 'text-amber'}>{tp.unlocked ? 'В СТРОЮ' : 'НЕ ОТКРЫТ'}</span></div>
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
              <Btn variant="primary" className="text-lg !py-3 !px-8" disabled={!tp.unlocked} onClick={onStart}>
                ▶ Начать бой
              </Btn>
            </div>
          </div>
        </div>

        {/* Правая колонка: характеристики / прокачка / камуфляж */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="flex gap-1">
            {([['stats', 'Характеристики'], ['upgrades', 'Прокачка'], ['camo', 'Камуфляж']] as [Tab, string][]).map(([t, l]) => (
              <Chip key={t} active={tab === t} onClick={() => setTab(t)} className="flex-1 text-center">
                {l}
              </Chip>
            ))}
          </div>
          <Panel className="flex-1 min-h-0 overflow-y-auto" title={tab === 'stats' ? 'Тактико-технические данные' : tab === 'upgrades' ? 'Модернизация' : 'Окраска'}>
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
                  const owned = tp.camos.includes(c);
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
