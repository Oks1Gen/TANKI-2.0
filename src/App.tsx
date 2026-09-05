import { useCallback, useEffect, useRef, useState } from 'react';
import { BattleConfig, BattleResult } from './game/config';
import { GameEngine, HudSnapshot } from './game/engine';
import { Progress } from './game/progress';
import { loadProfiles, saveProfiles, addAccount, removeAccount, Profiles, ADMIN_NAME } from './game/profiles';
import { audio } from './game/audio';
import Hangar from './ui/Hangar';
import BattleSetup from './ui/BattleSetup';
import Loading from './ui/Loading';
import HUD from './ui/HUD';
import { PauseOverlay, ResultsScreen } from './ui/Overlays';

type Screen = 'hangar' | 'setup' | 'battle';
type Setup = Pick<BattleConfig, 'mode' | 'bots' | 'biome' | 'time' | 'weather' | 'duration'>;

const SETUP_KEY = 'steel-assault-setup-v1';

function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) return { mode: 'deathmatch', bots: 6, biome: 'forest', time: 'day', weather: 'clear', duration: 'medium', ...JSON.parse(raw) };
  } catch {
    /* */
  }
  return { mode: 'deathmatch', bots: 6, biome: 'forest', time: 'day', weather: 'clear', duration: 'medium' };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('hangar');
  const [profiles, setProfiles] = useState<Profiles>(() => loadProfiles());
  const progress = profiles.accounts[profiles.current];
  const [setup, setSetupState] = useState<Setup>(() => loadSetup());
  const [battleCfg, setBattleCfg] = useState<BattleConfig | null>(null);
  const [battleId, setBattleId] = useState(0);

  const setProgress = (p: Progress) => {
    setProfiles((prev) => {
      const next = { ...prev, accounts: { ...prev.accounts, [prev.current]: p } };
      saveProfiles(next);
      return next;
    });
  };

  const switchAccount = (name: string) => {
    if (!profiles.accounts[name] || name === profiles.current) return;
    audio.ui('click');
    setProfiles((prev) => {
      const next = { ...prev, current: name };
      saveProfiles(next);
      return next;
    });
  };

  const createAccount = () => {
    const name = window.prompt('Название нового аккаунта:', `ИГРОК ${Object.keys(profiles.accounts).length}`);
    if (name === null) return;
    const next = addAccount(profiles, name);
    if (!next) return audio.ui('deny');
    audio.init();
    audio.ui('confirm');
    saveProfiles(next);
    setProfiles(next);
  };

  const deleteAccount = () => {
    const next = removeAccount(profiles, profiles.current);
    if (!next) return audio.ui('deny');
    audio.ui('click');
    saveProfiles(next);
    setProfiles(next);
  };
  const setSetup = (s: Setup) => {
    setSetupState(s);
    localStorage.setItem(SETUP_KEY, JSON.stringify(s));
  };

  const startBattle = () => {
    const tp = progress.tanks[progress.selectedTank];
    if (!tp.unlocked) return;
    audio.init();
    setBattleCfg({ ...setup, tank: progress.selectedTank, camo: tp.camo, upgrades: { ...tp.upgrades }, goldUpgrade: tp.goldUpgrade });
    setScreen('battle');
  };

  const onBattleEnd = (r: BattleResult) => {
    const p = structuredClone(progress);
    p.xp += r.xp;
    p.gold += r.gold;
    p.battles += 1;
    p.kills += r.kills;
    if (r.outcome === 'win') p.wins += 1;
    setProgress(p);
  };

  return (
    <div className="w-screen h-screen bg-olive-950 text-olive-200 overflow-hidden">
      {screen === 'hangar' && <Hangar progress={progress} setProgress={setProgress} setup={setup} setSetup={setSetup} onStart={startBattle} onSetup={() => setScreen('setup')} account={profiles.current} accounts={Object.keys(profiles.accounts)} isAdmin={profiles.current === ADMIN_NAME} onSwitchAccount={switchAccount} onCreateAccount={createAccount} onDeleteAccount={deleteAccount} />}
      {screen === 'setup' && <BattleSetup setup={setup} setSetup={setSetup} tank={progress.selectedTank} onBack={() => setScreen('hangar')} onStart={startBattle} />}
      {screen === 'battle' && battleCfg && (
        <Battle
          key={battleId}
          cfg={battleCfg}
          onEnd={onBattleEnd}
          onMenu={() => setScreen('hangar')}
          onRetry={() => setBattleId((i) => i + 1)}
        />
      )}
    </div>
  );
}

// ================= Экран боя =================
function Battle({ cfg, onEnd, onMenu, onRetry }: { cfg: BattleConfig; onEnd: (r: BattleResult) => void; onMenu: () => void; onRetry: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [phase, setPhase] = useState<'loading' | 'play' | 'paused' | 'results'>('loading');
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [staticMap, setStaticMap] = useState<{ obstacles: { x: number; z: number; w: number; d: number; kind: string }[]; half: number } | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new GameEngine(canvas, cfg, {
      onHud: (s) => setHud(s),
      onEnd: (r) => {
        setResult(r);
        setPhase('results');
        onEndRef.current(r);
      },
      onPause: () => setPhase((p) => (p === 'play' ? 'paused' : p)),
      onReady: () => setReady(true),
    });
    engineRef.current = engine;
    setStaticMap(engine.getStaticMinimap());
    // пока идёт загрузка — держим на паузе
    engine.paused = true;
    return () => {
      engine.dispose();
      engineRef.current = null;
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

  return (
    <div className="relative w-full h-full bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {hud && phase !== 'loading' && <HUD s={hud} staticMap={staticMap} />}
      {phase === 'loading' && <Loading cfg={cfg} ready={ready} onDone={onLoaded} />}
      {phase === 'paused' && <PauseOverlay onResume={resume} onMenu={onMenu} />}
      {phase === 'results' && result && <ResultsScreen r={result} onRetry={onRetry} onMenu={onMenu} />}
    </div>
  );
}
