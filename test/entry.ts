import { GameEngine } from '../src/game/engine';
import { BattleConfig } from '../src/game/config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export async function run(canvas: HTMLCanvasElement, getRaf: () => ((t: number) => void) | null) {
  const configs: BattleConfig[] = [
    { mode: 'deathmatch', biome: 'forest', time: 'day', weather: 'clear', duration: 'medium', bots: 6, tank: 't34', camo: 'base', upgrades: { gun: 1, engine: 0, armor: 2, sight: 0, ammo: 0, suspension: 0 }, goldUpgrade: false },
    { mode: 'capture', biome: 'desert', time: 'night', weather: 'storm', duration: 'short', bots: 9, tank: 't100lt', camo: 'desert', upgrades: { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, goldUpgrade: true },
    { mode: 'capture', biome: 'winter', time: 'dusk', weather: 'snow', duration: 'medium', bots: 12, tank: 'e100', camo: 'winter', upgrades: { gun: 5, engine: 5, armor: 5, sight: 5, ammo: 5, suspension: 5 }, goldUpgrade: true },
    { mode: 'deathmatch', biome: 'mountains', time: 'sunset', weather: 'fog', duration: 'medium', bots: 1, tank: 'e100', camo: 'forest', upgrades: { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, goldUpgrade: false },
  ];
  for (const cfg of configs) {
    let ended: Any = null;
    let hud: Any = null;
    let paused = 0;
    const eng = new GameEngine(canvas, cfg, {
      onHud: (s) => (hud = s),
      onEnd: (r) => (ended = r),
      onPause: () => paused++,
      onReady: () => {},
    });
    const e = eng as Any;
    // симулируем кадры
    let t = 0;
    const frame = (dt: number) => {
      t += dt * 1000;
      const cb = getRaf();
      if (cb) cb(t);
    };
    e.last = 0;
    frame(0.016);
    // игрок: движение + стрельба
    e.keys.add('KeyW');
    e.mouseDown = true;
    for (let i = 0; i < 600; i++) {
      if (i % 120 === 0) e.camYaw += 1.2;
      if (i === 100) e.keys.add('KeyA');
      if (i === 200) { e.keys.delete('KeyA'); e.keys.add('KeyD'); }
      if (i === 150) e.cycleShell(1);
      if (i === 300) e.cycleShell(1);
      frame(0.016);
    }
    // пауза/резюм
    e.pause();
    frame(0.016);
    e.resume();
    // принудительно убиваем часть ботов и игрока для проверки ветвей
    const bots = e.tanks.filter((x: Any) => !x.isPlayer);
    e.damageTank(bots[0], 99999, e.player, 1, bots[0].x, bots[0].z);
    e.damageTank(e.player, 99999, bots[1] ?? bots[0], 1, e.player.x + 5, e.player.z);
    for (let i = 0; i < 900; i++) frame(0.016);
    if (cfg.mode === 'capture') {
      // докручиваем таймер
      e.timeLeft = 0.5;
      for (let i = 0; i < 200; i++) frame(0.016);
    }
    if (!hud) throw new Error('no hud');
    if (!ended) throw new Error('battle did not end: ' + cfg.mode + ' alive=' + e.player.alive + ' ended=' + e.ended + ' endTimer=' + e.endTimer);
    console.log(cfg.mode, cfg.biome, '->', ended.outcome, 'kills', ended.kills, 'xp', ended.xp, 'shots', ended.shotsFired, 'hits', ended.shotsHit, 'paused', paused, 'destroyed obstacles', e.world.obstacles.filter((o: Any) => !o.alive).length, 'score', JSON.stringify(ended.score));
    eng.dispose();
  }

  // Тренировка (0 ботов): свободная практика — бой НЕ должен сам завершаться, исключений быть не должно
  {
    const cfg: BattleConfig = { mode: 'deathmatch', biome: 'forest', time: 'day', weather: 'clear', duration: 'medium', bots: 0, tank: 't34', camo: 'base', upgrades: { gun: 0, engine: 0, armor: 0, sight: 0, ammo: 0, suspension: 0 }, goldUpgrade: false };
    let ended: Any = null;
    let hud: Any = null;
    const eng = new GameEngine(canvas, cfg, {
      onHud: (s) => (hud = s),
      onEnd: (r) => (ended = r),
      onPause: () => {},
      onReady: () => {},
    });
    const e = eng as Any;
    let t = 0;
    const frame = (dt: number) => {
      t += dt * 1000;
      const cb = getRaf();
      if (cb) cb(t);
    };
    e.last = 0;
    frame(0.016);
    e.keys.add('KeyW');
    e.mouseDown = true;
    for (let i = 0; i < 600; i++) {
      if (i % 120 === 0) e.camYaw += 1.2;
      frame(0.016);
    }
    if (!hud) throw new Error('no hud in training');
    if (ended) throw new Error('training battle should not auto-end');
    if (e.tanks.length !== 1) throw new Error('training should have only player, got ' + e.tanks.length);
    console.log('deathmatch training(0 bots) -> running, no auto-end, hud ok');
    eng.dispose();
  }
}
