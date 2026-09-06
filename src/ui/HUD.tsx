import { memo, useEffect, useRef, useState } from 'react';
import { HudSnapshot } from '../game/engine';
import { SHELLS, SHELL_ORDER, ShellType, BOOST_DAMAGE_MUL, BOOST_SPEED_MUL } from '../game/config';
import { fmtTime } from './common';

interface Props {
  s: HudSnapshot;
  staticMap: { obstacles: { x: number; z: number; w: number; d: number; kind: string }[]; half: number } | null;
}

const PICKUP_COLORS: Record<string, string> = { repair: '#62ff7a', speed: '#5ad8ff', damage: '#ff7a3c', ammo: '#ffd84a' };
const MAP_SIZE = 200;
const MAP_STEPS = [148, 200, 256];

function pointColor(p: { contested: boolean; capturing: number; owner: number }) {
  if (p.contested) return '#ffb424';
  if (p.capturing === 0) return '#4aa3ff';
  if (p.capturing === 1) return '#ff5a5a';
  if (p.owner === 0) return '#4aa3ff';
  if (p.owner === 1) return '#ff5a5a';
  return '#8ea08c';
}

function pointStatus(p: { contested: boolean; capturing: number; owner: number }) {
  if (p.contested) return 'СПОР';
  if (p.capturing !== -1) return 'ЗАХВАТ';
  if (p.owner === 0) return 'СИНИЕ';
  if (p.owner === 1) return 'КРАСНЫЕ';
  return 'НЕЙТР.';
}

export default memo(function HUD({ s, staticMap }: Props) {
  const mapRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const lastMapDraw = useRef(0);
  const [mapIdx, setMapIdx] = useState(1);
  const mapSize = MAP_STEPS[mapIdx];
  const zoomIn = () => setMapIdx((v) => Math.min(MAP_STEPS.length - 1, v + 1));
  const zoomOut = () => setMapIdx((v) => Math.max(0, v - 1));

  // Зум карты с клавиатуры: кнопки +/- недоступны под pointer lock
  // (браузер отдаёт всю мышь canvas), а keydown до document доходит всегда.
  // Коды движком не заняты (WASD/QE/1-3/Esc), preventDefault не нужен.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomIn();
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomOut();
      else if (e.code === 'KeyM') setMapIdx((v) => (v + 1) % MAP_STEPS.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Статик миникарты: фон + сетка + препятствия — только при смене карты ----
  // Оффскрин в DPR-разрешении, иначе статика мыльная на ретине при drawImage в DPR-канвас.
  useEffect(() => {
    if (!staticMap) return;
    let off = staticRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!off) {
      off = document.createElement('canvas');
      staticRef.current = off;
    }
    off.width = MAP_SIZE * dpr;
    off.height = MAP_SIZE * dpr;
    const ctx = off.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = MAP_SIZE;
    const half = staticMap.half;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(8,11,8,0.82)';
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(185,255,61,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo((W / 4) * i, 0); ctx.lineTo((W / 4) * i, W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (W / 4) * i); ctx.lineTo(W, (W / 4) * i); ctx.stroke();
    }
    const sx = (x: number) => ((x / half + 1) / 2) * W;
    const sy = (z: number) => (1 - (z / half + 1) / 2) * W;
    for (const o of staticMap.obstacles) {
      ctx.fillStyle = o.kind === 'building' || o.kind === 'hangar' ? 'rgba(142,160,140,0.55)' : o.kind === 'bunker' || o.kind === 'concrete' ? 'rgba(150,150,145,0.65)' : o.kind === 'rock' || o.kind === 'hill' ? 'rgba(110,110,100,0.5)' : o.kind === 'tree' ? 'rgba(60,110,60,0.5)' : 'rgba(120,120,110,0.4)';
      const w = Math.max(2, (o.w / (half * 2)) * W);
      const d = Math.max(2, (o.d / (half * 2)) * W);
      ctx.fillRect(sx(o.x) - w / 2, sy(o.z) - d / 2, w, d);
    }
  }, [staticMap]);

  // ---- DPR-шарпнесс миникарты: бэкстор под текущий размер + DPR (зум/перетаскивание между мониторами) ----
  useEffect(() => {
    const c = mapRef.current;
    if (!c) return;
    try {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const need = Math.round(mapSize * dpr);
      if (c.width !== need || c.height !== need) {
        c.width = need;
        c.height = need;
      }
    } catch {
      /* */
    }
  }, [mapSize]);

  // ---- Миникарта: динамика поверх статики ----
  // Движок шлёт HUD ~8Гц; канвас 200px перерисовывать каждый тик избыточно — троттлим до ~5Гц.
  // Пропущенный тик догонит следующий: позиции всё равно дискретны на 8Гц данных.
  useEffect(() => {
    const now = performance.now();
    if (now - lastMapDraw.current < 200) return;
    lastMapDraw.current = now;
    const c = mapRef.current;
    if (!c || !staticMap) return;
    const ctx = c.getContext('2d')!;
    const dpr = c.width / mapSize;
    const W = MAP_SIZE;
    const k = mapSize / MAP_SIZE; // масштаб отображения: линия башни и шрифт растут с зумом
    const half = staticMap.half;
    const sx = (x: number) => ((x / half + 1) / 2) * W;
    const sy = (z: number) => (1 - (z / half + 1) / 2) * W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);
    if (staticRef.current) ctx.drawImage(staticRef.current, 0, 0, W, W);
    else {
      ctx.fillStyle = 'rgba(8,11,8,0.82)';
      ctx.fillRect(0, 0, W, W);
    }
    // разрушенные здания — тёмным поверх статики (статика рисуется 1 раз и не знает о разрушениях)
    const destroyed = s.minimap.destroyed ?? [];
    if (destroyed.length) {
      for (const o of destroyed) {
        const w = Math.max(2, (o.w / (half * 2)) * W);
        const d = Math.max(2, (o.d / (half * 2)) * W);
        const cx = sx(o.x) - w / 2;
        const cy = sy(o.z) - d / 2;
        ctx.fillStyle = 'rgba(8,8,8,0.85)';
        ctx.fillRect(cx, cy, w, d);
        ctx.strokeStyle = 'rgba(255,80,60,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + w, cy + d);
        ctx.moveTo(cx + w, cy);
        ctx.lineTo(cx, cy + d);
        ctx.stroke();
      }
    }
    // точки
    for (const p of s.points) {
      const col = pointColor(p);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // минимум 4px: на больших картах радиус 11м схлопывался в точку
      ctx.arc(sx(p.x), sy(p.z), Math.max(4, (11 / (half * 2)) * W), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.letter, sx(p.x), sy(p.z) + 4);
    }
    // пикапы
    for (const p of s.minimap.pickups) {
      if (!p.active) continue;
      ctx.fillStyle = PICKUP_COLORS[p.type];
      ctx.beginPath();
      ctx.moveTo(sx(p.x), sy(p.z) - 3);
      ctx.lineTo(sx(p.x) + 3, sy(p.z));
      ctx.lineTo(sx(p.x), sy(p.z) + 3);
      ctx.lineTo(sx(p.x) - 3, sy(p.z));
      ctx.fill();
    }
    // танки
    for (const t of s.minimap.tanks) {
      ctx.fillStyle = t.alive ? (t.team === 0 ? '#4aa3ff' : '#ff5a5a') : 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(sx(t.x), sy(t.z), t.alive ? 3.2 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // игрок
    const p = s.minimap.player;
    const px = sx(p.x), py = sy(p.z);
    const barrelLen = 16 * k;
    ctx.strokeStyle = 'rgba(185,255,61,0.5)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(p.turretYaw) * barrelLen, py - Math.cos(p.turretYaw) * barrelLen);
    ctx.stroke();
    ctx.fillStyle = '#b9ff3d';
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // рамка
    ctx.strokeStyle = 'rgba(185,255,61,0.4)';
    ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
  }, [s, staticMap]);

  const reloadPct = Math.min(1, Math.max(0, s.reload));
  // оконтовка цели: враг под прицелом — красный прицел, союзник — синий
  const crossColor = !s.alive ? '#666' : s.aimEnemy ? '#ff3b30' : s.aimAlly ? '#5aa9ff' : s.modules.gunBroken ? '#ff4d4d' : s.canFire ? '#b9ff3d' : '#ffb424';
  const R = 26;
  const circ = 2 * Math.PI * R;
  const hpPct = s.hp / s.maxHp;
  const hpColor = hpPct > 0.5 ? '#b9ff3d' : hpPct > 0.25 ? '#ffb424' : '#ff4d4d';
  const moving = s.speedKmh > 6 && s.alive;
  const lastNotifs = s.notifications.slice(-4);
  const lastKills = s.killfeed.slice(-5);
  const mapBorder = s.mode === 'deathmatch'
    ? 'rgba(185,255,61,0.45)'
    : s.score.blue === s.score.red
      ? 'rgba(185,255,61,0.45)'
      : s.score.blue > s.score.red
        ? 'rgba(74,163,255,0.7)'
        : 'rgba(255,90,90,0.7)';
  const aimText = s.modules.gunBroken
    ? 'ОРУДИЕ ПОВРЕЖДЕНО'
    : s.aimEnemy && s.aimName
      ? `ЦЕЛЬ: ${s.aimName} • ${Math.round(s.aimDistance)} м`
      : s.aimEnemy
        ? `ЦЕЛЬ • ${Math.round(s.aimDistance)} м`
        : s.aimAlly
          ? `СВОЙ • НЕ СТРЕЛЯЙ`
          : s.canFire
            ? `${Math.round(s.aimDistance)} м`
            : s.ammo[s.shell] <= 0
              ? 'НЕТ СНАРЯДОВ'
              : `ПЕРЕЗАРЯДКА ${s.reloadLeft.toFixed(1)} с`;

  return (
    <div className="absolute inset-0 pointer-events-none select-none font-display">
      {/* Виньетка урона */}
      {s.damageFlash > 0 && (
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 45%, rgba(255,40,40,${s.damageFlash * 0.55}) 100%)` }} />
      )}
      {s.damageFlash > 0.05 && (
        <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%,-50%) rotate(${s.damageDir}rad)`, opacity: s.damageFlash }}>
          <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-b-[22px] border-l-transparent border-r-transparent border-b-danger" style={{ transform: 'translateY(-110px)' }} />
        </div>
      )}
      {/* Низкое HP */}
      {s.alive && hpPct < 0.25 && <div className="absolute inset-0 pulse" style={{ boxShadow: 'inset 0 0 120px rgba(255,60,60,0.35)' }} />}

      {/* ===== Прицел: SVG-круг + дистанция/КД на пилюле с фоном ===== */}
      {s.alive && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <svg width="120" height="120" viewBox="-60 -60 120 120" aria-hidden>
            <circle r={R} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="4" />
            <circle r={R} fill="none" stroke={crossColor} strokeWidth={s.aimEnemy ? 3.5 : 2} strokeDasharray={`${circ * reloadPct} ${circ}`} transform="rotate(-90)" opacity="0.95" />
            <circle r={R + 6} fill="none" stroke={crossColor} strokeWidth={s.aimEnemy ? 2 : 1} opacity={s.aimEnemy ? 0.9 : 0.3} strokeDasharray="4 8" />
            {[0, 90, 180, 270].map((a) => (
              <line key={a} x1="0" y1={-(R + 10)} x2="0" y2={-(R + 18)} stroke={crossColor} strokeWidth="2" transform={`rotate(${a})`} />
            ))}
            <circle r="1.8" fill={crossColor} />
            {s.hitMarker > 0 && (
              <g stroke="#fff" strokeWidth="2.5" opacity={s.hitMarker}>
                <line x1="-10" y1="-10" x2="-5" y2="-5" /><line x1="10" y1="-10" x2="5" y2="-5" />
                <line x1="-10" y1="10" x2="-5" y2="5" /><line x1="10" y1="10" x2="5" y2="5" />
              </g>
            )}
          </svg>
          <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2">
            <div className="hud-cross-info mono" style={{ borderColor: `${crossColor}66` }}>
              <span className="hud-cross-dot" style={{ background: crossColor }} />
              <span style={{ color: crossColor }}>{aimText}</span>
              {s.magazine > 1 && s.alive && <span className="hud-cross-clip">[{s.clip}/{s.magazine}]</span>}
            </div>
          </div>
        </div>
      )}

      {/* ===== Верх-центр: одна сжатая пилюля СЧЁТ / ВРЕМЯ / ФРАГИ ===== */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        {s.mode === 'deathmatch' ? (
          <div className="hud-pill mono" role="status" aria-label="Счёт боя">
            <div className="hud-pill-cell">
              <div className="hud-pill-label">Противники</div>
              <div className="hud-pill-value text-team-red">{s.enemiesAlive}<span className="hud-pill-sub">/{s.enemiesTotal}</span></div>
            </div>
            <div className="hud-pill-sep" aria-hidden />
            <div className="hud-pill-cell">
              <div className="hud-pill-label">Время</div>
              <div className="hud-pill-value t-strong tabular-nums">{fmtTime(s.time)}</div>
            </div>
            <div className="hud-pill-sep" aria-hidden />
            <div className="hud-pill-cell">
              <div className="hud-pill-label">Фраги</div>
              <div className="hud-pill-value text-lime tabular-nums">{s.kills}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="hud-pill mono" role="status" aria-label="Счёт команд">
              <div className="hud-pill-cell">
                <div className="hud-pill-label !text-team-blue">Синие · {s.alliesAlive + (s.alive ? 1 : 0)}</div>
                <div className="hud-pill-value text-team-blue tabular-nums">{s.score.blue}</div>
              </div>
              <div className="hud-pill-sep" aria-hidden />
              <div className="hud-pill-cell">
                <div className="hud-pill-label">Осталось</div>
                <div className={`hud-pill-value tabular-nums ${s.timeLeft < 30 ? 'text-amber pulse' : 't-strong'}`}>{fmtTime(s.timeLeft)}</div>
              </div>
              <div className="hud-pill-sep" aria-hidden />
              <div className="hud-pill-cell">
                <div className="hud-pill-label !text-team-red">Красные · {s.enemiesAlive}</div>
                <div className="hud-pill-value text-team-red tabular-nums">{s.score.red}</div>
              </div>
            </div>
            <div className="flex gap-1.5">
              {s.points.map((p) => (
                <PointChip key={p.letter} letter={p.letter} owner={p.owner} progress={p.progress} capturing={p.capturing} contested={p.contested} />
              ))}
            </div>
          </>
        )}
        {s.inPoint && s.alive && <div className="hud-flag mono text-lime pulse">В зоне точки {s.inPoint}</div>}
        {s.invuln > 0 && s.alive && <div className="hud-flag mono text-team-blue">Защита {s.invuln.toFixed(1)} с</div>}
      </div>

      {/* ===== Киллфид справа: иконка черепа, без красной кромки ===== */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 items-end max-w-[320px]">
        {lastKills.map((k) => (
          <div key={k.id} className="hud-kill mono">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0 opacity-80">
              <path d="M12 2C7 2 3 6 3 11c0 2.4 1 4.5 2.6 6 .4.4.4 1 .4 1.5V20c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-1.5c0-.5 0-1.1.4-1.5C20 15.5 21 13.4 21 11c0-5-4-9-9-9zM8.5 14.2c-1 0-1.8-.9-1.8-2 0-1 .8-1.9 1.8-1.9s1.8.9 1.8 1.9c0 1.1-.8 2-1.8 2zm7 0c-1 0-1.8-.9-1.8-2 0-1 .8-1.9 1.8-1.9s1.8.9 1.8 1.9c0 1.1-.8 2-1.8 2z" />
            </svg>
            <span className="truncate">{k.text}</span>
          </div>
        ))}
      </div>

      {/* ===== Уведомления слева: лимит 4, авто-фейд через CSS ===== */}
      <div className="absolute left-4 top-1/3 flex flex-col gap-1.5 max-w-[360px]">
        {lastNotifs.map((n) => (
          <div
            key={n.id}
            className={`hud-notif mono ${n.kind === 'good' ? 'hud-notif-good' : n.kind === 'bad' ? 'hud-notif-bad' : n.kind === 'warn' ? 'hud-notif-warn' : n.kind === 'kill' ? 'hud-notif-kill' : 'hud-notif-info'}`}
          >
            {n.kind === 'kill' && <span className="text-lime mr-1 font-bold">✕</span>}
            <span>{n.text}</span>
          </div>
        ))}
      </div>

      {/* ===== Левый низ: состояние танка + понятные SVG-модули ===== */}
      <div className="absolute left-4 bottom-4 flex flex-col gap-2 w-[300px]">
        {(s.boosts.speed > 0 || s.boosts.damage > 0) && (
          <div className="flex gap-2 mono text-[11px]">
            {s.boosts.speed > 0 && <div className="hud-boost" style={{ borderColor: '#5ad8ff88', color: '#5ad8ff' }}>Форсаж +{Math.round((BOOST_SPEED_MUL - 1) * 100)}% · {s.boosts.speed.toFixed(0)} с</div>}
            {s.boosts.damage > 0 && <div className="hud-boost" style={{ borderColor: '#ff7a3c88', color: '#ff7a3c' }}>Урон +{Math.round((BOOST_DAMAGE_MUL - 1) * 100)}% · {s.boosts.damage.toFixed(0)} с</div>}
          </div>
        )}
        <div className="panel p-3">
          <div className="flex justify-between items-baseline mono">
            <span className="hud-label">Прочность</span>
            <span className="text-xl font-bold leading-none tabular-nums" style={{ color: hpColor }}>{s.hp}<span className="t-faint text-xs"> / {s.maxHp}</span></span>
          </div>
          <div className="bar !h-2.5 mt-1.5" role="progressbar" aria-label="Прочность" aria-valuemin={0} aria-valuemax={s.maxHp} aria-valuenow={s.hp}>
            <i style={{ width: `${hpPct * 100}%`, background: hpColor }} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Module label="Орудие" v={s.modules.gun} broken={s.modules.gunBroken} icon={<GunIcon />} />
            <Module label="Двигатель" v={s.modules.engine} broken={s.modules.engineBroken} icon={<EngineIcon />} />
            <Module label="Гусеницы" v={s.modules.track} broken={s.modules.trackBroken} icon={<TrackIcon />} />
          </div>
          <div className="flex justify-between mono text-[11px] t-dim mt-2.5">
            <span className="tracking-[0.14em]">Скорость</span>
            <span className="t-strong tabular-nums">{s.speedKmh.toFixed(0)} км/ч</span>
          </div>
        </div>
      </div>

      {/* ===== Низ-центр: снаряды + перезарядка в одном блоке ===== */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="hud-ammo">
          <div className="flex justify-between items-baseline mono">
            <span className={`hud-label !text-[11px] ${s.canFire ? '!text-lime' : ''}`}>{s.canFire ? 'Орудие готово' : s.ammo[s.shell] <= 0 ? 'Нет снарядов' : 'Перезарядка'}</span>
            <span className="mono text-[11px] t-strong tabular-nums">{s.canFire ? 'ГОТОВ' : `${s.reloadLeft.toFixed(1)} с`}</span>
          </div>
          <div className="bar !h-1.5" role="progressbar" aria-label="Перезарядка" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(reloadPct * 100)}>
            <i style={{ width: `${reloadPct * 100}%`, background: s.canFire ? '#b9ff3d' : '#ffb424' }} />
          </div>
          <div className="flex items-stretch gap-2">
            {SHELL_ORDER.map((id: ShellType, i) => {
              const sh = SHELLS[id];
              const active = s.shell === id;
              const col = '#' + sh.color.toString(16).padStart(6, '0');
              const empty = s.ammo[id] === 0;
              return (
                <div
                  key={id}
                  className={`hud-shell mono ${active ? 'active' : ''} ${empty ? 'empty' : ''}`}
                  style={{ ['--shell' as string]: col }}
                  title={`${sh.name}: ${sh.desc}. Клавиша ${i + 1}`}
                >
                  <span className="hud-key" aria-hidden>{i + 1}</span>
                  <span className="hud-shell-short" style={{ color: col }}>{sh.short}</span>
                  <span className={`hud-shell-count tabular-nums ${empty ? 'text-danger' : ''}`}>{s.ammo[id]}</span>
                  <span className="hud-shell-name">{sh.name}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mono text-[11px] t-faint">
            <span>Q ◀ смена</span>
            <span className="tracking-[0.14em]">1–3 выбор</span>
            <span>смена ▶ E</span>
          </div>
        </div>
      </div>

      {/* ===== Миникарта: зум +/-, прозрачность в движении, обводка счётом ===== */}
      <div
        className="absolute right-4 bottom-4 hud-map"
        style={{ opacity: moving ? 0.55 : 1 }}
      >
        <div className="mono text-[11px] tracking-[0.18em] t-dim mb-1.5 flex justify-between items-center gap-3">
          <span>Тактическая карта</span>
          <span className="text-lime tabular-nums">{s.minimap.player.x.toFixed(0)} · {s.minimap.player.z.toFixed(0)}</span>
        </div>
        <div className="hud-map-frame" style={{ borderColor: mapBorder }} title="Тактическая карта. Масштаб: клавиши − / + или M">
          <canvas ref={mapRef} width={MAP_SIZE} height={MAP_SIZE} style={{ width: mapSize, height: mapSize }} className="block" role="img" aria-label="Тактическая миникарта боя" />
          <div className="hud-map-btns pointer-events-auto">
            <button
              type="button"
              aria-label="Уменьшить карту"
              title="Уменьшить карту (−)"
              className="hud-map-btn"
              disabled={mapIdx === 0}
              onClick={zoomOut}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Увеличить карту"
              title="Увеличить карту (+)"
              className="hud-map-btn"
              disabled={mapIdx === MAP_STEPS.length - 1}
              onClick={zoomIn}
            >
              +
            </button>
          </div>
        </div>
        <div className="mono text-[10px] t-faint mt-1 text-right tracking-[0.12em]">− / + или M — масштаб</div>
      </div>

      {/* ===== Смерть ===== */}
      {!s.alive && (
        <div className="absolute inset-0 flex items-center justify-center bg-danger/10">
          <div className="panel px-10 py-6 text-center border-danger/60">
            <div className="text-4xl font-bold tracking-[0.3em] text-danger glow-red">ТАНК УНИЧТОЖЕН</div>
            {s.mode === 'capture' ? (
              <>
                <div className="mono text-sm text-olive-300 mt-2 tracking-widest">ВОЗРОЖДЕНИЕ ЧЕРЕЗ</div>
                <div className="mono text-5xl font-bold text-lime mt-1 tabular-nums">{Math.ceil(s.respawnIn)}</div>
              </>
            ) : (
              <div className="mono text-sm text-olive-300 mt-2 tracking-widest">ПОДВЕДЕНИЕ ИТОГОВ…</div>
            )}
          </div>
        </div>
      )}

      {/* ===== Подсказка захвата мыши ===== */}
      {!s.pointerLocked && s.alive && (
        <div className="absolute inset-x-0 top-[22%] flex justify-center">
          <div className="panel px-6 py-2 mono text-[12px] text-lime tracking-[0.2em] pulse">НАЖМИТЕ НА ЭКРАН, ЧТОБЫ ВЗЯТЬ УПРАВЛЕНИЕ</div>
        </div>
      )}
    </div>
  );
});

/** Точка захвата: компактный чип с кольцевым прогрессом вместо бара. */
const PointChip = memo(function PointChip({ letter, owner, progress, capturing, contested }: { letter: string; owner: number; progress: number; capturing: number; contested: boolean }) {
  const col = pointColor({ contested, capturing, owner });
  const pct = Math.min(1, Math.abs(progress));
  const Rc = 9;
  const Cc = 2 * Math.PI * Rc;
  return (
    <div className="hud-point mono" style={{ borderColor: `${col}55` }} title={`${pointStatus({ contested, capturing, owner })} — ${Math.round(pct * 100)}%`}>
      <span className="hud-point-ring">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <circle cx="13" cy="13" r={Rc} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.5" />
          <circle
            cx="13" cy="13" r={Rc} fill="none"
            stroke={col} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={`${Cc * pct} ${Cc}`}
            transform="rotate(-90 13 13)"
          />
        </svg>
        <span className="hud-point-letter" style={{ color: col }}>{letter}</span>
      </span>
      <span className="hud-point-status" style={{ color: col }}>{pointStatus({ contested, capturing, owner })}</span>
    </div>
  );
});

const Module = memo(function Module({ label, v, broken, icon }: { label: string; v: number; broken: boolean; icon: React.ReactNode }) {
  const col = broken ? '#ff4d4d' : v < 0.5 ? '#ffb424' : '#b9ff3d';
  const status = broken ? 'Ремонт' : v < 0.5 ? 'Поврежд.' : 'Норма';
  return (
    <div className={`hud-module mono ${broken ? 'pulse' : ''}`} style={{ borderColor: `${col}55` }} title={`${label}: ${status} (${Math.round(v * 100)}%)`}>
      <span className="hud-module-icon" style={{ color: col }}>{icon}</span>
      <span className="hud-module-label">{label}</span>
      <span className="bar !h-1 mt-1" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
        <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: col }} />
      </span>
      <span className="hud-module-status" style={{ color: col }}>{status}</span>
    </div>
  );
});

function GunIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19 15 8" />
      <rect x="13.5" y="4.5" width="7" height="5" rx="1" />
      <path d="M18.5 7h2.5" />
      <circle cx="4.5" cy="18.5" r="2.4" />
      <circle cx="4.5" cy="18.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EngineIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="6" y="8" width="12" height="9" rx="1.5" />
      <path d="M9 8V5M12 8V4M15 8V5" />
      <path d="M9 17v3M15 17v3" />
      <path d="M6 12.5h12" />
    </svg>
  );
}

function TrackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="8" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="16" cy="12" r="1.4" />
    </svg>
  );
}
