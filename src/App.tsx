import { useCallback, useEffect, useRef, useState } from 'react';
import { BattleConfig, BattleResult, BIOMES, WEATHERS, TIMES, BOT_DIFFICULTIES, BotDifficulty } from './game/config';
import { GameEngine, HudSnapshot } from './game/engine';
import { Progress, cloneProgress, defaultProgress, normalizeProgress } from './game/progress';
import { loadProfiles, saveProfiles, addAccount, removeAccount, Profiles, ADMIN_NAME, isValidAccountName, exportProfiles, importProfilesJson } from './game/profiles';
import { getRankIndex, promotionGoldReward, canUseTank } from './game/ranks';
import { loadSettings, syncBodyQualityAttr } from './game/settings';
import { audio } from './game/audio';
import Hangar from './ui/Hangar';
import BattleSetup from './ui/BattleSetup';
import Loading from './ui/Loading';
import HUD from './ui/HUD';
import ErrorBoundary from './ui/ErrorBoundary';
import PromotionModal, { Promotion } from './ui/PromotionModal';
import { getWebGLStatus } from './game/webgl';
import { PauseOverlay, ResultsScreen } from './ui/Overlays';

type Screen = 'hangar' | 'setup' | 'battle';
type Setup = Pick<BattleConfig, 'mode' | 'bots' | 'botDifficulty' | 'biome' | 'time' | 'weather' | 'duration'>;

const SETUP_KEY = 'steel-assault-setup-v1';

function loadSetup(): Setup {
  const fb: Setup = { mode: 'deathmatch', bots: 6, botDifficulty: 'veteran', biome: 'forest', time: 'day', weather: 'clear', duration: 'medium' };
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return fb;
    const j = JSON.parse(raw) as Partial<Setup>;
    return {
      mode: j.mode === 'capture' || j.mode === 'deathmatch' ? j.mode : fb.mode,
      bots: typeof j.bots === 'number' && Number.isFinite(j.bots) ? Math.max(0, Math.min(12, Math.floor(j.bots))) : fb.bots,
      botDifficulty: (BOT_DIFFICULTIES as string[]).includes(j.botDifficulty as string) ? (j.botDifficulty as BotDifficulty) : fb.botDifficulty,
      biome: (BIOMES as string[]).includes(j.biome as string) ? (j.biome as Setup['biome']) : fb.biome,
      time: (TIMES as string[]).includes(j.time as string) ? (j.time as Setup['time']) : fb.time,
      weather: (WEATHERS as string[]).includes(j.weather as string) ? (j.weather as Setup['weather']) : fb.weather,
      duration: j.duration === 'short' || j.duration === 'long' || j.duration === 'medium' ? j.duration : fb.duration,
    };
  } catch {
    /* */
  }
  return fb;
}

function resolveProgress(profiles: Profiles): Progress {
  try {
    const acc = (profiles as { accounts?: unknown })?.accounts;
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
      const map = acc as Record<string, unknown>;
      const cur = typeof profiles.current === 'string' ? profiles.current : '';
      if (cur && Object.prototype.hasOwnProperty.call(map, cur)) {
        return normalizeProgress(map[cur]);
      }
      if (Object.prototype.hasOwnProperty.call(map, ADMIN_NAME)) {
        return normalizeProgress(map[ADMIN_NAME]);
      }
      const first = Object.keys(map)[0];
      if (first) return normalizeProgress(map[first]);
    }
  } catch {
    /* */
  }
  return defaultProgress();
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('hangar');
  const [profiles, setProfiles] = useState<Profiles>(() => {
    try {
      return loadProfiles();
    } catch {
      return { current: ADMIN_NAME, accounts: { [ADMIN_NAME]: defaultProgress() } } as Profiles;
    }
  });
  const progress: Progress = resolveProgress(profiles);
  const [setup, setSetupState] = useState<Setup>(() => loadSetup());
  const [battleCfg, setBattleCfg] = useState<BattleConfig | null>(null);
  const [battleId, setBattleId] = useState(0);
  const [promo, setPromo] = useState<Promotion | null>(null);

  // body[data-quality] для CSS (гашение blur на low) — до первого боя, пока движка нет
  useEffect(() => {
    try { syncBodyQualityAttr(loadSettings().quality); } catch { /* */ }
  }, []);

  const setProgress = (p: Progress) => {
    setProfiles((prev) => {
      const next = { ...prev, accounts: { ...prev.accounts, [prev.current]: p } };
      saveProfiles(next);
      return next;
    });
  };

  const switchAccount = (name: string) => {
    try {
      if (!profiles?.accounts || !Object.prototype.hasOwnProperty.call(profiles.accounts, name) || name === profiles.current) return;
    } catch {
      return;
    }
    audio.ui('click');
    setProfiles((prev) => {
      const next = { ...prev, current: name };
      saveProfiles(next);
      return next;
    });
  };

  const createAccount = (name: string): string | null => {
    const clean = name.trim().slice(0, 16);
    if (!clean) {
      audio.ui('deny');
      return 'Имя не должно быть пустым.';
    }
    if (!isValidAccountName(clean)) {
      audio.ui('deny');
      return 'Недопустимое имя аккаунта.';
    }
    const next = addAccount(profiles, clean);
    if (!next) {
      audio.ui('deny');
      return `Имя «${clean}» уже занято.`;
    }
    audio.init();
    audio.ui('confirm');
    saveProfiles(next);
    setProfiles(next);
    return null;
  };

  // Подтверждение удаления — в модалке ангара, здесь только действие.
  const deleteAccount = () => {
    if (profiles.current === ADMIN_NAME) return audio.ui('deny');
    const next = removeAccount(profiles, profiles.current);
    if (!next) return audio.ui('deny');
    audio.ui('click');
    saveProfiles(next);
    setProfiles(next);
  };
  const setSetup = (s: Setup) => {
    setSetupState(s);
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(s));
    } catch {
      /* quota/private mode — настройки остаются только в памяти */
    }
  };

  const exportSave = () => {
    try {
      audio.init();
      if (!exportProfiles(profiles)) audio.ui('deny');
      else audio.ui('confirm');
    } catch {
      audio.ui('deny');
    }
  };

  // Возвращает текст ошибки или null при успехе — ошибку показывает модалка ангара.
  const importSave = (file: File): Promise<string | null> => {
    return file.text().then((text) => {
      const parsed = importProfilesJson(text);
      if (!parsed) {
        audio.ui('deny');
        return 'Не удалось прочитать бэкап: неверный файл.';
      }
      saveProfiles(parsed);
      setProfiles(parsed);
      audio.ui('confirm');
      return null;
    }).catch(() => {
      audio.ui('deny');
      return 'Не удалось прочитать файл бэкапа.';
    });
  };

  const startBattle = () => {
    let tp;
    try {
      tp = progress?.tanks?.[progress?.selectedTank];
    } catch {
      tp = undefined;
    }
    if (!tp || !tp.unlocked) {
      try { audio.ui('deny'); } catch { /* */ }
      return;
    }
    // эксклюзив за звание: техника высокого ранга
    if (!canUseTank(progress.totalXp ?? progress.xp, progress.selectedTank)) {
      try { audio.ui('deny'); } catch { /* */ }
      return;
    }
    audio.init();
    setBattleCfg({ ...setup, tank: progress.selectedTank, camo: tp.camo, upgrades: { ...tp.upgrades }, goldUpgrade: tp.goldUpgrade });
    setScreen('battle');
  };

  const onBattleEnd = (r: BattleResult) => {
    const p = cloneProgress(progress);
    const beforeTotal = Number.isFinite(progress.totalXp) ? progress.totalXp : progress.xp;
    const afterTotal = Math.max(0, beforeTotal + r.xp);
    p.xp = Math.max(0, p.xp + r.xp);
    p.totalXp = afterTotal;
    p.gold = Math.max(0, p.gold + r.gold);
    p.battles += 1;
    p.kills += r.kills;
    if (r.outcome === 'win') p.wins += 1;
    // повышение: сравниваем звание до/после по несгораемому опыту
    try {
      const fromIdx = getRankIndex(beforeTotal);
      const toIdx = getRankIndex(afterTotal);
      if (toIdx > fromIdx) {
        const bonus = promotionGoldReward(fromIdx, toIdx);
        if (bonus > 0) p.gold += bonus;
        setPromo({ fromIdx, toIdx, bonusGold: bonus });
      }
    } catch {
      /* звание — косметика, бой не ломаем */
    }
    setProgress(p);
  };

  return (
    <div className="relative w-screen h-screen bg-olive-950 text-olive-200 overflow-hidden">
      <ErrorBoundary>
        {screen === 'hangar' && <Hangar progress={progress} setProgress={setProgress} setup={setup} setSetup={setSetup} onStart={startBattle} onSetup={() => setScreen('setup')} account={profiles.current} accounts={Object.keys(profiles.accounts ?? {})} isAdmin={profiles.current === ADMIN_NAME} onSwitchAccount={switchAccount} onCreateAccount={createAccount} onDeleteAccount={deleteAccount} onExportSave={exportSave} onImportSave={importSave} />}
        {screen === 'setup' && (
          <ErrorBoundary>
            <BattleSetup setup={setup} setSetup={setSetup} tank={progress.selectedTank} onBack={() => setScreen('hangar')} onStart={startBattle} />
          </ErrorBoundary>
        )}
        {screen === 'battle' && battleCfg && (
          <Battle
            key={battleId}
            cfg={battleCfg}
            totalXp={progress.totalXp ?? progress.xp}
            onEnd={onBattleEnd}
            onMenu={() => setScreen('hangar')}
            onRetry={() => setBattleId((i) => i + 1)}
          />
        )}
        {promo && (
          <PromotionModal promo={promo} totalXp={progress.totalXp ?? progress.xp} onClose={() => setPromo(null)} />
        )}
      </ErrorBoundary>
    </div>
  );
}

// ================= Экран боя =================
function Battle({ cfg, totalXp, onEnd, onMenu, onRetry }: { cfg: BattleConfig; totalXp: number; onEnd: (r: BattleResult) => void; onMenu: () => void; onRetry: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [phase, setPhase] = useState<'loading' | 'play' | 'paused' | 'results'>('loading');
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staticMap, setStaticMap] = useState<{ obstacles: { x: number; z: number; w: number; d: number; kind: string }[]; half: number } | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const endedRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const initial = canvasRef.current;
    if (!initial) {
      setError('Не найден canvas для боя. Попробуйте перезапустить бой.');
      return;
    }
    let canvas = initial;
    endedRef.current = false;
    let engine: GameEngine | null = null;
    const makeEngine = (c: HTMLCanvasElement) =>
      new GameEngine(c, cfg, {
        onHud: (s) => setHud(s),
        onEnd: (r) => {
          // награда начисляется ровно один раз за бой
          if (endedRef.current) return;
          endedRef.current = true;
          setResult(r);
          setPhase('results');
          onEndRef.current(r);
        },
        onPause: () => setPhase((p) => (p === 'play' ? 'paused' : p)),
        onReady: () => setReady(true),
      });
    try {
      engine = makeEngine(canvas);
    } catch (e) {
      // отравленный контекст (старый forceContextLoss): пробуем на свежем canvas
      const msg = e instanceof Error ? e.message : String(e);
      let retried = false;
      if (/precision|context/i.test(msg)) {
        try {
          const fresh = document.createElement('canvas');
          fresh.setAttribute('class', 'absolute inset-0 w-full h-full');
          canvas.replaceWith(fresh);
          canvasRef.current = fresh;
          canvas = fresh;
          engine = makeEngine(canvas);
          retried = true;
        } catch (e2) {
          console.error('[battle] engine retry failed', e2);
        }
      }
      if (!retried || !engine) {
        console.error('[battle] engine init failed', e);
        let detail = e instanceof Error ? e.message : 'Не удалось создать WebGL-контекст';
        try {
          const st = getWebGLStatus();
          if (!st.ok) detail += ` (${st.error ?? ''} ${st.hint ?? ''}`.trim() + ')';
        } catch {
          /* */
        }
        setError(detail);
        return;
      }
    }
    engineRef.current = engine;
    try {
      setStaticMap(engine.getStaticMinimap());
    } catch {
      /* */
    }
    // пока идёт загрузка — держим на паузе
    engine.paused = true;
    return () => {
      try {
        engine.dispose();
      } catch {
        /* */
      }
      if (engineRef.current === engine) engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoaded = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setPhase('play');
    e.resume();
  }, []);

  const resume = () => {
    engineRef.current?.resume();
    setPhase('play');
  };

  const applySettingsLive = useCallback((s: import('./game/settings').Settings) => {
    try {
      engineRef.current?.applySettings(s);
    } catch { /* */ }
  }, []);

  return (
    <div className="relative w-full h-full bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-olive-950/90 p-4 overflow-auto">
          <div className="panel p-8 w-[520px] text-center">
            <div className="text-2xl font-bold text-danger">НЕ УДАЛОСЬ ЗАПУСТИТЬ БОЙ</div>
            <div className="mono text-xs text-olive-300 mt-2 break-words text-left bg-olive-900/60 border border-olive-500/30 p-3 max-h-[160px] overflow-auto">{error}</div>
            <div className="mono text-[11px] text-olive-400 mt-2 text-left leading-relaxed">
              1) Откройте https://get.webgl.org/ — должен вращаться куб.
              <br />
              2) Chrome/Edge: Настройки — Система — «Использовать аппаратное ускорение».
              <br />
              3) Проверьте chrome://gpu (WebGL должен быть Hardware accelerated).
            </div>
            <button onClick={onMenu} className="chip mt-4">Вернуться в ангар</button>
          </div>
        </div>
      )}
      {hud && phase !== 'loading' && !error && <HUD s={hud} staticMap={staticMap} />}
      {phase === 'loading' && <Loading cfg={cfg} ready={ready} onDone={onLoaded} onCancel={onMenu} />}
      {phase === 'paused' && <PauseOverlay onResume={resume} onMenu={onMenu} onSettings={applySettingsLive} />}
      {phase === 'results' && result && <ResultsScreen r={result} totalXp={totalXp} onRetry={onRetry} onMenu={onMenu} />}
    </div>
  );
}
