import { useEffect, useRef, useState } from 'react';
import { TANKS, TANK_ORDER, TankId, UPGRADES, upgradeCost, CAMOS, CAMO_ORDER, CamoId, computeStats, GameMode, MODE_NAMES, BIOME_NAMES, TIME_NAMES, WEATHER_NAMES, BattleConfig } from '../game/config';
import { Progress, cloneProgress } from '../game/progress';
import { getRank, getRankIndex, canUseTank, rankNameForTank, RANKS } from '../game/ranks';
import { audio } from '../game/audio';
import TankPreview from './TankPreview';
import RankBadge from './RankBadge';
import RankProgress from './RankProgress';
import { Panel, Btn, Chip, Currency, Corner, Modal, Segment } from './common';

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
  /** Возвращает текст ошибки или null при успехе. Нативных prompt/alert больше нет. */
  onCreateAccount: (name: string) => string | null;
  onDeleteAccount: () => void;
  onExportSave: () => void;
  /** Резолвится в текст ошибки или null при успехе. */
  onImportSave: (file: File) => Promise<string | null>;
}

type Tab = 'stats' | 'upgrades' | 'camo' | 'ranks';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'stats', label: 'ТТХ', icon: '▤' },
  { id: 'upgrades', label: 'Прокачка', icon: '⬢' },
  { id: 'camo', label: 'Камуфляж', icon: '◨' },
  { id: 'ranks', label: 'Звания', icon: '★' },
];

const TAB_TITLES: Record<Tab, string> = {
  stats: 'Тактико-технические данные',
  upgrades: 'Модернизация',
  camo: 'Окраска',
  ranks: 'Звания и награды',
};

/** Плоский силуэт танка сверху: корпус + гусеницы + башня. Размером кодируем класс. */
function TankSilhouette({ id, active }: { id: TankId; active: boolean }) {
  const s = TANKS[id];
  const k = Math.max(0.85, Math.min(1.15, s.scale.length / 8.2));
  const stroke = active ? '#b9ff3d' : '#8ea08c';
  return (
    <svg
      viewBox="0 0 72 48"
      width={76}
      height={51}
      aria-hidden
      className="shrink-0"
      style={{ transform: `scale(${k})`, opacity: active ? 1 : 0.85 }}
    >
      <rect x="3" y="9" width="10" height="30" rx="3" fill="#131b15" stroke={stroke} strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x="59" y="9" width="10" height="30" rx="3" fill="#131b15" stroke={stroke} strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x="15" y="12" width="42" height="24" rx="6" fill="#263427" stroke={stroke} strokeWidth="1.5" />
      <rect x="34" y="1" width="4" height="16" fill="#3a4c3a" stroke={stroke} strokeWidth="1" />
      <circle cx="36" cy="24" r="9.5" fill="#1b261d" stroke={stroke} strokeWidth="1.5" />
      <circle cx="36" cy="24" r="3" fill="none" stroke={stroke} strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  );
}

export default function Hangar({ progress, setProgress, setup, setSetup, onStart: _onStart, onSetup, account, accounts, isAdmin, onSwitchAccount, onCreateAccount, onDeleteAccount, onExportSave, onImportSave }: Props) {
  const [tab, setTab] = useState<Tab>('stats');
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountModal, setAccountModal] = useState<null | 'create' | 'delete'>(null);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingGold, setPendingGold] = useState(false);
  const [pendingCamo, setPendingCamo] = useState<CamoId | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
  const lockedSel = !tp.unlocked || rankLockedSel;

  // закрытие поповеров по клику мимо / Esc
  useEffect(() => {
    if (!accountOpen && !helpOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (accountRef.current && !accountRef.current.contains(t)) setAccountOpen(false);
      if (helpRef.current && !helpRef.current.contains(t)) setHelpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountOpen(false);
        setHelpOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [accountOpen, helpOpen]);

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

  const confirmGoldUpgrade = () => {
    if (tp.goldUpgrade || progress.gold < spec.goldUpgrade.cost) return audio.ui('deny');
    const p = cloneProgress(progress);
    p.gold -= spec.goldUpgrade.cost;
    p.tanks[sel].goldUpgrade = true;
    setProgress(p);
    setPendingGold(false);
    audio.ui('confirm');
  };

  const confirmCamo = () => {
    const c = pendingCamo;
    if (!c) return;
    const already = progress.tanks[sel]?.camos.includes(c);
    const p = cloneProgress(progress);
    if (!p.tanks[sel].camos.includes(c)) {
      if (p.gold < CAMOS[c].cost) return audio.ui('deny');
      p.gold -= CAMOS[c].cost;
      p.tanks[sel].camos.push(c);
    }
    p.tanks[sel].camo = c;
    setProgress(p);
    setPendingCamo(null);
    audio.ui(already ? 'click' : 'confirm');
  };

  const pickCamo = (c: (typeof CAMO_ORDER)[number]) => {
    const already = progress.tanks[sel]?.camos.includes(c);
    if (!already) {
      if (progress.gold < CAMOS[c].cost) return audio.ui('deny');
      setPendingCamo(c);
      return;
    }
    const p = cloneProgress(progress);
    p.tanks[sel].camo = c;
    setProgress(p);
    audio.ui('click');
  };

  const submitCreate = () => {
    const err = onCreateAccount(createName);
    if (err) {
      setCreateError(err);
      return;
    }
    setCreateError(null);
    setCreateName('');
    setAccountModal(null);
    setAccountOpen(false);
  };

  const onPickFile = async (f: File | undefined) => {
    if (!f) return;
    const err = await onImportSave(f);
    setImportError(err);
    if (!err) setAccountOpen(false);
  };

  const battles = progress.battles ?? 0;
  const wins = progress.wins ?? 0;
  const kills = progress.kills ?? 0;
  const winrate = battles > 0 ? Math.round((wins / battles) * 100) : 0;
  const statusChip = rankLockedSel
    ? { text: `Нужно звание «${rankNameForTank(sel)}»`, cls: 'border-team-red/70 text-team-red bg-team-red/10' }
    : !tp.unlocked
      ? { text: 'Не открыт', cls: 'border-amber/70 text-amber bg-amber/10' }
      : { text: 'В строю', cls: 'border-lime/70 text-lime bg-lime/10' };

  return (
    <div className="w-full h-full grid-bg relative flex flex-col fade-in">
      {/* ===== Шапка: 2 яруса ===== */}
      <header className="shrink-0 border-b border-lime/15 bg-olive-900/70 px-4 sm:px-6 pt-3 pb-2.5 flex flex-col gap-2.5">
        {/* Ярус 1: лого + валюта + В БОЙ */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 border border-lime/50 rounded-md flex items-center justify-center relative shrink-0 bg-olive-950/60">
              <span className="text-lime font-bold text-xl">⊕</span>
            </div>
            <div className="min-w-0">
              <h1 className="display-md !text-[26px] tracking-[0.22em] leading-none truncate">СТАЛЬНОЙ ШТУРМ</h1>
              <div className="caption mt-1">Командный пункт · Ангар 01</div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Currency xp={progress.xp ?? 0} gold={progress.gold ?? 0} />
            <Btn
              variant="primary"
              className="!py-2.5 !px-8 !text-[15px]"
              disabled={lockedSel}
              title={rankLockedSel ? `Нужно звание «${rankNameForTank(sel)}»` : !tp.unlocked ? 'Машина не открыта' : 'Перейти к настройке боя'}
              onClick={onSetup}
            >
              В бой
            </Btn>
          </div>
        </div>
        {/* Ярус 2: звание + прогресс + аккаунт, статистика — в тултипе */}
        <div className="flex items-center gap-3 flex-wrap">
          <RankBadge totalXp={totalXp} size="sm" />
          <div className="flex-1 min-w-[180px] max-w-[440px]">
            <RankProgress totalXp={totalXp} compact />
          </div>
          <span
            className="mono text-[11px] px-2 py-1 border rounded-md tracking-[0.2em]"
            style={{ borderColor: rank.color + '88', color: rank.color }}
            title={`Префикс чата: ${rank.chatPrefix} · значок: ${rank.badge}`}
          >
            {rank.chatPrefix}
          </span>
          {isAdmin && <span className="mono text-[11px] px-2 py-1 border border-amber text-amber rounded-md tracking-[0.25em]">АДМИН</span>}
          <span
            className="mono text-[11px] px-2 py-1 border border-olive-500/40 text-olive-300 rounded-md tracking-[0.12em] cursor-help"
            title={`Боёв: ${battles} · Побед: ${wins} · Винрейт: ${winrate}% · Уничтожено: ${kills}`}
          >
            ⚔ {battles} · ★ {wins}
          </span>
          <div className="flex-1" />
          {/* Аккаунт: свой дропдаун вместо select */}
          <div ref={accountRef} className="relative">
            <button
              type="button"
              onClick={() => {
                audio.ui('click');
                setAccountOpen((v) => !v);
              }}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              title="Аккаунт: переключить, создать, бэкап"
              className="chip !text-[12px] !py-2 flex items-center gap-2 max-w-[220px]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-lime shrink-0" aria-hidden />
              <span className="truncate text-olive-200 font-bold">{account}</span>
              <span aria-hidden className="text-olive-400 text-[10px]">{accountOpen ? '▲' : '▼'}</span>
            </button>
            {accountOpen && (
              <div className="account-pop panel p-2" role="menu" aria-label="Аккаунты">
                <div className="caption px-2 pt-1 pb-2">Аккаунт</div>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                  {accounts.map((a) => {
                    const cur = a === account;
                    const admin = a === 'АДМИН';
                    return (
                      <button
                        key={a}
                        type="button"
                        role="menuitemradio"
                        aria-checked={cur}
                        onClick={() => {
                          onSwitchAccount(a);
                          setAccountOpen(false);
                        }}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-left transition-all ${cur ? 'border-lime/70 bg-lime/10 text-lime' : 'border-transparent text-olive-200 hover:border-olive-500/50 hover:bg-olive-800/60'}`}
                      >
                        <span className="flex-1 truncate font-bold text-[14px]">{a}</span>
                        {admin && <span className="mono text-[10px] text-amber border border-amber/50 rounded px-1">АДМИН</span>}
                        {cur && <span aria-hidden className="text-lime text-[12px]">✓</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="divider my-2" />
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" className="chip text-center" onClick={() => { setCreateName(''); setCreateError(null); setAccountModal('create'); }}>+ Новый</button>
                  <button type="button" className="chip text-center" title="Скачать бэкап всех аккаунтов (JSON)" onClick={() => { onExportSave(); }}>⤓ Бэкап</button>
                  <button type="button" className="chip text-center" title="Восстановить из бэкапа (JSON)" onClick={() => fileRef.current?.click()}>⤒ Импорт</button>
                  <button
                    type="button"
                    className="chip text-center"
                    disabled={isAdmin}
                    title={isAdmin ? 'Аккаунт АДМИН удалить нельзя' : `Удалить «${account}»`}
                    onClick={() => { if (!isAdmin) setAccountModal('delete'); }}
                  >
                    × Удалить
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void onPickFile(f);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="hangar-grid">
        {/* Левая колонка: выбор танка */}
        <div className="hangar-col-scroll flex flex-col gap-3 min-h-0">
          <Panel title="Боевые машины" right={<span className="caption">{TANK_ORDER.length} шт</span>}>
            <div className="flex flex-col gap-2">
              {TANK_ORDER.map((id) => {
                const t = TANKS[id];
                const pr = progress.tanks[id];
                const active = id === sel;
                const rankOk = canUseTank(totalXp, id);
                const reqName = rankNameForTank(id);
                const eff = (() => {
                  try {
                    return computeStats(id, pr?.upgrades ?? { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, !!pr?.goldUpgrade);
                  } catch {
                    return computeStats(id, { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, false);
                  }
                })();
                const upPct = (() => {
                  if (!pr) return 0;
                  const lvls = UPGRADES.map((u) => (pr.upgrades[u.id] ?? 0) / u.maxLevel);
                  return Math.round((lvls.reduce((a, b) => a + b, 0) / lvls.length) * 100);
                })();
                return (
                  <div
                    key={id}
                    className={`relative rounded-lg border transition-all ${active ? 'border-lime bg-lime/10' : 'border-olive-500/40 bg-olive-800/60 hover:border-olive-300/60'}`}
                  >
                    {active && <Corner />}
                    {/* Зона выбора — отдельная кнопка, вне зоны покупки */}
                    <button
                      type="button"
                      onMouseEnter={() => audio.ui('hover')}
                      onClick={() => {
                        audio.init();
                        audio.ui('click');
                        selectTank(id);
                      }}
                      aria-pressed={active}
                      title={!rankOk ? `Требуется звание «${reqName}»` : !pr?.unlocked ? `Открыть за ${t.unlockXp} XP` : `Выбрать ${t.name}`}
                      className="tank-pick p-3"
                    >
                      <div className="flex gap-3 items-start">
                        <TankSilhouette id={id} active={active} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <div className="text-[19px] font-bold text-olive-200 truncate">{t.name}</div>
                            {active && <span className="mono text-[11px] text-lime tracking-[0.15em] shrink-0">● ВЫБРАН</span>}
                          </div>
                          <div className="caption !text-[11px]">{t.role}</div>
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            <div className="rounded border border-olive-500/30 bg-olive-950/50 px-1.5 py-1 text-center">
                              <div className="mono text-[13px] font-bold text-olive-200 tabular-nums leading-none">{eff.hp}</div>
                              <div className="mono text-[10px] text-olive-400 mt-0.5">ПРОЧН.</div>
                            </div>
                            <div className="rounded border border-olive-500/30 bg-olive-950/50 px-1.5 py-1 text-center">
                              <div className="mono text-[13px] font-bold text-olive-200 tabular-nums leading-none">{eff.damage}</div>
                              <div className="mono text-[10px] text-olive-400 mt-0.5">УРОН</div>
                            </div>
                            <div className="rounded border border-olive-500/30 bg-olive-950/50 px-1.5 py-1 text-center">
                              <div className="mono text-[13px] font-bold text-olive-200 tabular-nums leading-none">{Math.round(eff.speed * 3.6)}</div>
                              <div className="mono text-[10px] text-olive-400 mt-0.5">КМ/Ч</div>
                            </div>
                          </div>
                          {pr?.unlocked && rankOk ? (
                            <div className="mt-2 flex items-center gap-2" title={`Прокачка модулей: ${upPct}%`}>
                              <div className="bar flex-1 !h-[5px]">
                                <i style={{ width: `${upPct}%` }} />
                              </div>
                              <span className="mono text-[10px] text-olive-400 tabular-nums">{upPct}%</span>
                            </div>
                          ) : (
                            <div className={`mono text-[11px] mt-2 tracking-[0.08em] ${!rankOk ? 'text-team-red' : 'text-amber'}`}>
                              {!rankOk ? `★ Требуется звание: ${reqName}` : `Заблокирован · ${t.unlockXp} XP`}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                    {/* Зона покупки — вне кликабельной зоны выбора */}
                    {!pr?.unlocked && (
                      <div className="px-3 pb-3 flex items-center justify-between gap-2">
                        <span className="mono text-[11px] text-amber">Открытие · {t.unlockXp} XP</span>
                        <Btn
                          className="!py-1.5 !px-3 !text-[12px]"
                          disabled={progress.xp < t.unlockXp || !rankOk}
                          title={!rankOk ? `Нужно звание «${reqName}»` : progress.xp < t.unlockXp ? `Не хватает ${t.unlockXp - progress.xp} XP` : `Открыть ${t.name}`}
                          onClick={() => unlock(id)}
                        >
                          Открыть
                        </Btn>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Центр: 3D-предпросмотр */}
        <div className="relative panel min-h-0 overflow-hidden hangar-center">
          <TankPreview tank={sel} camo={safeCamo} />
          {/* Верх: только подпись + помощь. Крупный заголовок убран наверх — не спорит с моделью. */}
          <div className="absolute left-4 top-3 pointer-events-none">
            <div className="caption">Ангар 01 · предпросмотр</div>
          </div>
          <div ref={helpRef} className="absolute right-4 top-3">
            <button
              type="button"
              onClick={() => {
                audio.ui('click');
                setHelpOpen((v) => !v);
              }}
              aria-expanded={helpOpen}
              aria-label="Управление и подсказки"
              title="Управление и подсказки"
              className="chip !rounded-full !w-8 !h-8 !p-0 !text-[14px] font-bold bg-olive-950/70 backdrop-blur-md"
            >
              ?
            </button>
            {helpOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[264px] panel p-4 z-30" role="dialog" aria-label="Управление">
                <div className="panel-title mb-2">Управление</div>
                <div className="mono text-[12px] text-olive-300 space-y-1.5 leading-relaxed">
                  <div><span className="text-lime">W / S</span> — ход вперёд / назад</div>
                  <div><span className="text-lime">A / D</span> — поворот корпуса</div>
                  <div><span className="text-lime">Мышь</span> — башня и прицел</div>
                  <div><span className="text-lime">ЛКМ / Пробел</span> — выстрел</div>
                  <div><span className="text-lime">Q / E, 1-3</span> — тип снаряда</div>
                  <div><span className="text-lime">ESC</span> — пауза</div>
                </div>
                <div className="divider my-2.5" />
                <div className="mono text-[11px] text-olive-400 leading-relaxed">
                  Предпросмотр: вращение — ЛКМ, зум — колесо. Камеры — пилюля внизу.
                </div>
              </div>
            )}
          </div>
          {/* Ским для читаемости низа поверх 3D */}
          <div className="absolute inset-x-0 bottom-0 h-52 hangar-scrim pointer-events-none" />
          {/* Низ: имя слева · режим+В БОЙ по центру · статус справа */}
          <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-[150px] pointer-events-none">
                <div className="text-[30px] sm:text-4xl font-bold t-strong leading-none" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>
                  {spec.name}
                </div>
                <div className="mono text-[12px] text-lime tracking-[0.2em] uppercase mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
                  {spec.role}
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 pointer-events-auto order-first w-full lg:order-none lg:w-auto">
                <div className="rounded-full px-3 py-1.5 flex items-center gap-2 border border-olive-500/30 bg-olive-950/70 backdrop-blur-md">
                  <div className="flex gap-1.5">
                    {(['deathmatch', 'capture'] as GameMode[]).map((m) => (
                      <Chip key={m} active={setup.mode === m} onClick={() => setSetup({ ...setup, mode: m })}>
                        {MODE_NAMES[m]}
                      </Chip>
                    ))}
                  </div>
                  <span className="mono text-[11px] text-olive-300 hidden md:inline">
                    {BIOME_NAMES[setup.biome]} · {TIME_NAMES[setup.time]} · {WEATHER_NAMES[setup.weather]}
                  </span>
                </div>
                <Btn
                  variant="primary"
                  className="!text-[18px] !py-3 !px-12 sm:!px-16"
                  disabled={lockedSel}
                  title={rankLockedSel ? `Нужно звание «${rankNameForTank(sel)}»` : !tp.unlocked ? 'Машина не открыта' : 'Перейти к настройке боя'}
                  onClick={onSetup}
                >
                  В бой
                </Btn>
              </div>
              <div className="flex-1 min-w-[150px] flex flex-col items-end gap-1.5 pointer-events-none">
                <div className="mono text-[11px] text-olive-300 text-right leading-relaxed" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
                  <div>КАМУФЛЯЖ: <span className="text-olive-200">{camoName}</span></div>
                  <div>ОРУДИЕ: <span className="text-olive-200">{tp.goldUpgrade ? spec.goldUpgrade.name.toUpperCase() : 'ШТАТНОЕ'}</span></div>
                </div>
                <span className={`mono text-[11px] px-2.5 py-1 rounded-full border tracking-[0.15em] uppercase backdrop-blur-md ${statusChip.cls}`}>
                  {statusChip.text}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Правая колонка: сегмент-табы + контент */}
        <div className="flex flex-col gap-2.5 min-h-0">
          <Segment<Tab> options={TABS} value={tab} onChange={(t) => setTab(t)} />
          <Panel className="flex-1 min-h-0 lg:overflow-y-auto" title={TAB_TITLES[tab]}>
            {tab === 'ranks' && (
              <RanksTab totalXp={totalXp} />
            )}
            {tab === 'stats' && (
              <div>
                <TechRow label="Прочность" value={stats.hp} baseVal={base.hp} max={3200} suffix=" ед." />
                <TechRow label="Скорость" value={Math.round(stats.speed * 3.6)} baseVal={Math.round(base.speed * 3.6)} max={75} suffix=" км/ч" />
                <TechRow label="Поворот корпуса" value={+(stats.hullTurn * 57.3).toFixed(0)} baseVal={+(base.hullTurn * 57.3).toFixed(0)} max={170} suffix="°/с" />
                <TechRow label="Поворот башни" value={+(stats.turretTurn * 57.3).toFixed(0)} baseVal={+(base.turretTurn * 57.3).toFixed(0)} max={230} suffix="°/с" />
                <TechRow label="Урон за выстрел" value={stats.damage} baseVal={base.damage} max={700} suffix=" ед." color="#ffb424" />
                <TechRow label="Перезарядка" value={+stats.reload.toFixed(1)} baseVal={+base.reload.toFixed(1)} max={12} suffix=" с" color="#ffb424" invert decimals={1} />
                {stats.magazine > 1 && <TechRow label="Барабан" value={stats.magazine} baseVal={1} max={4} suffix=" сн." color="#4aa3ff" />}
                <div className="mono text-[12px] text-olive-300 mt-3 grid grid-cols-3 gap-2">
                  <div className="border border-olive-500/40 rounded-md p-2 text-center bg-olive-950/40">
                    <div className="text-[11px] text-olive-400">ББ</div>
                    <div className="text-lime font-bold text-[15px] tabular-nums">{stats.ammo.AP}</div>
                  </div>
                  <div className="border border-olive-500/40 rounded-md p-2 text-center bg-olive-950/40">
                    <div className="text-[11px] text-olive-400">КС</div>
                    <div className="text-team-blue font-bold text-[15px] tabular-nums">{stats.ammo.HEAT}</div>
                  </div>
                  <div className="border border-olive-500/40 rounded-md p-2 text-center bg-olive-950/40">
                    <div className="text-[11px] text-olive-400">ОФ</div>
                    <div className="text-amber font-bold text-[15px] tabular-nums">{stats.ammo.HE}</div>
                  </div>
                </div>
                <div className="mono text-[11px] text-olive-400 mt-3 leading-relaxed">
                  Прирост от прокачки: прочность +{stats.hp - base.hp}, урон +{stats.damage - base.damage}, скорость +{Math.round((stats.speed - base.speed) * 3.6)} км/ч.
                </div>
                <div className="mt-3 body-md">{spec.desc}</div>
              </div>
            )}
            {tab === 'upgrades' && (
              <div className="space-y-2">
                {!tp.unlocked && <div className="mono text-[12px] text-amber mb-2">Машина не открыта. Прокачка недоступна.</div>}
                {UPGRADES.map((u) => {
                  const lvl = tp.upgrades[u.id];
                  const max = lvl >= u.maxLevel;
                  const cost = upgradeCost(u, lvl);
                  const gold = Math.ceil(cost / 12);
                  const xpTitle = max
                    ? 'Улучшено до максимума'
                    : !tp.unlocked
                      ? 'Машина не открыта'
                      : progress.xp >= cost
                        ? `Улучшить за ${cost} XP`
                        : `Нужно ${cost} XP (не хватает ${cost - progress.xp})`;
                  const goldTitle = max
                    ? 'Улучшено до максимума'
                    : !tp.unlocked
                      ? 'Машина не открыта'
                      : progress.gold >= gold
                        ? `Ускорить за ${gold} золота`
                        : `Нужно ${gold} золота (не хватает ${gold - progress.gold})`;
                  return (
                    <div key={u.id} className="rounded-lg border border-olive-500/40 p-3 bg-olive-900/50">
                      <div className="flex justify-between items-baseline gap-2">
                        <div className="font-bold text-[15px] text-olive-200">{u.name}</div>
                        <div className="mono text-[11px] text-lime shrink-0">{u.perLevel}</div>
                      </div>
                      <div className="body-md !text-[13px] mt-0.5">{u.desc}</div>
                      <div className="flex items-center gap-2 mt-2.5">
                        <div className="flex gap-1 flex-1" title={`Уровень ${lvl} / ${u.maxLevel}`}>
                          {Array.from({ length: u.maxLevel }).map((_, i) => (
                            <div key={i} className={`h-2 flex-1 rounded-sm ${i < lvl ? 'bg-lime' : 'bg-olive-950 border border-olive-500/40'}`} />
                          ))}
                        </div>
                        {max ? (
                          <span className="mono text-[11px] text-lime tracking-[0.15em]">МАКС</span>
                        ) : (
                          <>
                            <Btn className="!py-2 !px-3 !text-[12px]" disabled={!tp.unlocked || progress.xp < cost} title={xpTitle} onClick={() => buyUpgrade(u.id, false)}>
                              {cost} XP
                            </Btn>
                            <Btn className="!py-2 !px-3 !text-[12px] !border-amber/50 hover:!text-amber" disabled={!tp.unlocked || progress.gold < gold} title={goldTitle} onClick={() => buyUpgrade(u.id, true)}>
                              {gold} ◆
                            </Btn>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className={`rounded-lg border p-3 ${tp.goldUpgrade ? 'border-amber bg-amber/10' : 'border-amber/40 bg-olive-900/50'}`}>
                  <div className="panel-title !text-amber mb-1">Особое улучшение</div>
                  <div className="font-bold text-[15px] text-olive-200">{spec.goldUpgrade.name}</div>
                  <div className="body-md !text-[13px]">{spec.goldUpgrade.desc}</div>
                  <div className="mt-2.5 flex justify-end">
                    {tp.goldUpgrade ? (
                      <span className="mono text-[11px] text-amber tracking-[0.15em]">УСТАНОВЛЕНО</span>
                    ) : (
                      <Btn
                        className="!py-2 !px-4 !text-[12px] !border-amber/60 hover:!text-amber"
                        disabled={!tp.unlocked || progress.gold < spec.goldUpgrade.cost}
                        title={
                          !tp.unlocked
                            ? 'Машина не открыта'
                            : progress.gold >= spec.goldUpgrade.cost
                              ? `Купить за ${spec.goldUpgrade.cost} золота`
                              : `Нужно ${spec.goldUpgrade.cost} золота (не хватает ${spec.goldUpgrade.cost - progress.gold})`
                        }
                        onClick={() => {
                          if (!tp.unlocked || progress.gold < spec.goldUpgrade.cost) return audio.ui('deny');
                          setPendingGold(true);
                        }}
                      >
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
                        pickCamo(c);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          audio.init();
                          pickCamo(c);
                        }
                      }}
                      className={`relative cursor-pointer rounded-lg border p-2 transition-all ${active ? 'border-lime bg-lime/10' : 'border-olive-500/40 bg-olive-900/50 hover:border-olive-300/60'}`}
                    >
                      {active && <Corner />}
                      <div className="h-14 w-full flex rounded overflow-hidden">
                        {cs.colors.map((col, i) => (
                          <div key={i} className="flex-1" style={{ background: '#' + col.toString(16).padStart(6, '0') }} />
                        ))}
                      </div>
                      <div className="flex justify-between items-baseline mt-2 gap-1">
                        <span className="font-bold text-[14px] text-olive-200 truncate">{cs.name}</span>
                        <span className={`mono text-[11px] shrink-0 ${owned ? 'text-lime' : 'text-amber'}`}>{owned ? (active ? 'УСТАНОВЛЕН' : 'КУПЛЕН') : `${cs.cost} ◆`}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="col-span-2 mono text-[11px] text-olive-400 leading-relaxed mt-1">
                  Камуфляж не влияет на распознавание: союзники и враги помечаются цветными маркерами команд.
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* ===== Модалки: аккаунты и покупки (вместо prompt/confirm) ===== */}
      {accountModal === 'create' && (
        <Modal title="Новый аккаунт" onClose={() => { setAccountModal(null); setCreateError(null); }}>
          <label className="caption block mb-1.5" htmlFor="hangar-new-account">Название · до 16 символов</label>
          <input
            id="hangar-new-account"
            autoFocus
            value={createName}
            maxLength={16}
            onChange={(e) => {
              setCreateName(e.target.value);
              setCreateError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
            }}
            placeholder={`ИГРОК ${accounts.length}`}
            className="w-full mono text-[14px] bg-olive-950 border border-olive-500/40 rounded-md text-olive-200 px-3 py-2.5 outline-none placeholder:text-olive-500/60 focus:border-lime/70"
          />
          {createError && <div className="mono text-[12px] text-danger mt-2">{createError}</div>}
          <div className="flex justify-end gap-2 mt-4">
            <Btn onClick={() => { setAccountModal(null); setCreateError(null); }}>Отмена</Btn>
            <Btn variant="primary" disabled={!createName.trim()} onClick={submitCreate}>
              Создать
            </Btn>
          </div>
        </Modal>
      )}
      {accountModal === 'delete' && (
        <Modal title="Удалить аккаунт" onClose={() => setAccountModal(null)}>
          <div className="body-md">
            Удалить аккаунт <span className="text-olive-200 font-bold">«{account}»</span> со всем прогрессом?
            Действие необратимо.
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn onClick={() => setAccountModal(null)}>Отмена</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                onDeleteAccount();
                setAccountModal(null);
                setAccountOpen(false);
              }}
            >
              Удалить
            </Btn>
          </div>
        </Modal>
      )}
      {importError && (
        <Modal title="Импорт не удался" onClose={() => setImportError(null)}>
          <div className="body-md">{importError}</div>
          <div className="flex justify-end mt-4">
            <Btn variant="primary" onClick={() => setImportError(null)}>Понятно</Btn>
          </div>
        </Modal>
      )}
      {pendingGold && (
        <Modal title="Особое улучшение" onClose={() => setPendingGold(false)}>
          <div className="body-md">
            Купить <span className="text-amber font-bold">«{spec.goldUpgrade.name}»</span> за{' '}
            <span className="text-amber font-bold">{spec.goldUpgrade.cost} золота</span>?
          </div>
          <div className="mono text-[12px] text-olive-400 mt-2">Доступно золота: {(progress.gold ?? 0).toLocaleString('ru-RU')}</div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn onClick={() => setPendingGold(false)}>Отмена</Btn>
            <Btn variant="primary" onClick={confirmGoldUpgrade}>Купить</Btn>
          </div>
        </Modal>
      )}
      {pendingCamo && (
        <Modal title="Камуфляж" onClose={() => setPendingCamo(null)}>
          <div className="body-md">
            Купить камуфляж <span className="text-olive-200 font-bold">«{CAMOS[pendingCamo].name}»</span> за{' '}
            <span className="text-amber font-bold">{CAMOS[pendingCamo].cost} золота</span>?
          </div>
          <div className="mono text-[12px] text-olive-400 mt-2">Доступно золота: {(progress.gold ?? 0).toLocaleString('ru-RU')}</div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn onClick={() => setPendingCamo(null)}>Отмена</Btn>
            <Btn variant="primary" onClick={confirmCamo}>Купить</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Строка ТТХ с дельтой прокачки: прирост — зелёным, улучшение перезарядки — голубым. */
function TechRow({
  label,
  value,
  baseVal,
  max,
  suffix = '',
  color = '#b9ff3d',
  invert = false,
  decimals = 0,
}: {
  label: string;
  value: number;
  baseVal: number;
  max: number;
  suffix?: string;
  color?: string;
  invert?: boolean;
  decimals?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const delta = value - baseVal;
  const improved = invert ? delta < 0 : delta > 0;
  const worsened = invert ? delta > 0 : delta < 0;
  const fmt = (v: number) => (decimals > 0 ? v.toFixed(decimals) : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const deltaTxt =
    Math.abs(delta) < 1e-9
      ? null
      : `${delta > 0 ? '+' : ''}${fmt(delta)}${suffix}`;
  return (
    <div className="mb-2.5">
      <div className="flex justify-between items-baseline text-[13px] mono mb-1 gap-2">
        <span className="text-olive-300 uppercase tracking-wider">{label}</span>
        <span className="text-olive-200 tabular-nums shrink-0">
          {fmt(value)}{suffix}
          {deltaTxt && (
            <span
              className={`ml-1.5 text-[12px] font-bold ${improved ? (invert ? 'delta-down-good' : 'delta-up') : worsened ? 'delta-bad' : ''}`}
              title={improved ? 'Прирост от прокачки' : 'Изменение от прокачки'}
            >
              {deltaTxt}
            </span>
          )}
        </span>
      </div>
      <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <i style={{ width: `${pct}%`, background: color }} />
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
      <div className="mono text-[11px] text-olive-400 mb-2 leading-relaxed">
        Прогрессия — по суммарному опыту (не сгорает при тратах). Всего {totalXp.toLocaleString('ru-RU')} XP.
      </div>
      <div className="space-y-1">
        {RANKS.map((r) => {
          const reached = r.index <= cur;
          const isCur = r.index === cur;
          return (
            <div
              key={r.id}
              className="border rounded-md p-2 flex items-center gap-2"
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
                  <span className="font-bold text-[14px] truncate" style={{ color: reached ? r.color : '#8ea08c' }}>
                    {isCur ? '▶ ' : ''}{r.name}
                  </span>
                  <span className="mono text-[11px] text-olive-300 shrink-0 tabular-nums">{r.xp.toLocaleString('ru-RU')} XP</span>
                </div>
                <div className="mono text-[11px] text-olive-300 truncate">
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
