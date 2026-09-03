import { useEffect, useRef } from 'react';
import { HudSnapshot } from '../game/engine';
import { SHELLS, SHELL_ORDER, ShellType } from '../game/config';
import { fmtTime } from './common';

interface Props {
  s: HudSnapshot;
  staticMap: { obstacles: { x: number; z: number; w: number; d: number; kind: string }[]; half: number } | null;
}

const PICKUP_COLORS: Record<string, string> = { repair: '#62ff7a', speed: '#5ad8ff', damage: '#ff7a3c', ammo: '#ffd84a' };

export default function HUD({ s, staticMap }: Props) {
  const mapRef = useRef<HTMLCanvasElement>(null);

  // ---- Миникарта ----
  useEffect(() => {
    const c = mapRef.current;
    if (!c || !staticMap) return;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const half = staticMap.half;
    const sx = (x: number) => ((x / half + 1) / 2) * W;
    const sy = (z: number) => (1 - (z / half + 1) / 2) * W;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(8,11,8,0.82)';
    ctx.fillRect(0, 0, W, W);
    // сетка
    ctx.strokeStyle = 'rgba(185,255,61,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo((W / 4) * i, 0); ctx.lineTo((W / 4) * i, W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (W / 4) * i); ctx.lineTo(W, (W / 4) * i); ctx.stroke();
    }
    // препятствия
    for (const o of staticMap.obstacles) {
      ctx.fillStyle = o.kind === 'building' ? 'rgba(142,160,140,0.55)' : o.kind === 'rock' || o.kind === 'hill' ? 'rgba(110,110,100,0.5)' : o.kind === 'tree' ? 'rgba(60,110,60,0.5)' : 'rgba(120,120,110,0.4)';
      const w = Math.max(2, (o.w / (half * 2)) * W);
      const d = Math.max(2, (o.d / (half * 2)) * W);
      ctx.fillRect(sx(o.x) - w / 2, sy(o.z) - d / 2, w, d);
    }
    // точки
    for (const p of s.points) {
      const col = p.contested ? '#ffb424' : p.capturing === 0 ? '#4aa3ff' : p.capturing === 1 ? '#ff5a5a' : p.owner === 0 ? '#4aa3ff' : p.owner === 1 ? '#ff5a5a' : '#c2cebd';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.z), (11 / (half * 2)) * W, 0, Math.PI * 2);
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
    ctx.strokeStyle = 'rgba(185,255,61,0.5)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(p.turretYaw) * 16, py - Math.cos(p.turretYaw) * 16);
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
  const crossColor = !s.alive ? '#666' : s.modules.gunBroken ? '#ff4d4d' : s.canFire ? '#b9ff3d' : '#ffb424';
  const R = 26;
  const circ = 2 * Math.PI * R;
  const hpPct = s.hp / s.maxHp;
  const hpColor = hpPct > 0.5 ? '#b9ff3d' : hpPct > 0.25 ? '#ffb424' : '#ff4d4d';

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

      {/* ===== Прицел ===== */}
      {s.alive && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <svg width="120" height="120" viewBox="-60 -60 120 120">
            <circle r={R} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="4" />
            <circle r={R} fill="none" stroke={crossColor} strokeWidth="2" strokeDasharray={`${circ * reloadPct} ${circ}`} transform="rotate(-90)" opacity="0.95" />
            <circle r={R + 6} fill="none" stroke={crossColor} strokeWidth="1" opacity="0.3" strokeDasharray="4 8" />
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
          <div className="absolute left-1/2 top-full -translate-x-1/2 mono text-[10px] text-center whitespace-nowrap" style={{ color: crossColor }}>
            {s.modules.gunBroken ? 'ОРУДИЕ ПОВРЕЖДЕНО' : s.canFire ? `${Math.round(s.aimDistance)} м` : s.ammo[s.shell] <= 0 ? 'НЕТ СНАРЯДОВ' : `${s.reloadLeft.toFixed(1)} с`}
            {s.magazine > 1 && s.alive && <span className="ml-2 text-olive-200">[{s.clip}/{s.magazine}]</span>}
          </div>
        </div>
      )}

      {/* ===== Верх: цель режима ===== */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        {s.mode === 'deathmatch' ? (
          <div className="panel px-5 py-2 flex items-center gap-5 mono">
            <div className="text-center">
              <div className="text-[9px] tracking-[0.2em] text-olive-300">ПРОТИВНИКИ</div>
              <div className="text-2xl font-bold text-team-red glow-red leading-none">{s.enemiesAlive}<span className="text-olive-400 text-sm">/{s.enemiesTotal}</span></div>
            </div>
            <div className="w-px h-8 bg-olive-500/50" />
            <div className="text-center">
              <div className="text-[9px] tracking-[0.2em] text-olive-300">ВРЕМЯ</div>
              <div className="text-2xl font-bold text-olive-200 leading-none">{fmtTime(s.time)}</div>
            </div>
            <div className="w-px h-8 bg-olive-500/50" />
            <div className="text-center">
              <div className="text-[9px] tracking-[0.2em] text-olive-300">УНИЧТОЖЕНО</div>
              <div className="text-2xl font-bold text-lime leading-none">{s.kills}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="panel px-5 py-2 flex items-center gap-5 mono">
              <div className="text-center">
                <div className="text-[9px] tracking-[0.2em] text-team-blue">СИНИЕ · {s.alliesAlive + (s.alive ? 1 : 0)}</div>
                <div className="text-2xl font-bold text-team-blue leading-none">{s.score.blue}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] tracking-[0.2em] text-olive-300">ОСТАЛОСЬ</div>
                <div className={`text-2xl font-bold leading-none ${s.timeLeft < 30 ? 'text-amber pulse' : 'text-olive-200'}`}>{fmtTime(s.timeLeft)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] tracking-[0.2em] text-team-red">КРАСНЫЕ · {s.enemiesAlive}</div>
                <div className="text-2xl font-bold text-team-red leading-none">{s.score.red}</div>
              </div>
            </div>
            <div className="flex gap-2">
              {s.points.map((p) => {
                const col = p.contested ? '#ffb424' : p.capturing === 0 ? '#4aa3ff' : p.capturing === 1 ? '#ff5a5a' : p.owner === 0 ? '#4aa3ff' : p.owner === 1 ? '#ff5a5a' : '#8ea08c';
                return (
                  <div key={p.letter} className="w-16 bg-olive-950/80 border px-1 py-1 text-center mono" style={{ borderColor: col }}>
                    <div className="font-bold text-lg leading-none" style={{ color: col }}>{p.letter}</div>
                    <div className="h-1 bg-olive-950 mt-1 relative overflow-hidden">
                      <div className="absolute top-0 bottom-0" style={{ left: p.progress < 0 ? `${50 + p.progress * 50}%` : '50%', width: `${Math.abs(p.progress) * 50}%`, background: p.progress > 0 ? '#4aa3ff' : '#ff5a5a' }} />
                    </div>
                    <div className="text-[8px] tracking-wider mt-0.5" style={{ color: col }}>
                      {p.contested ? 'СПОР' : p.capturing !== -1 ? 'ЗАХВАТ' : p.owner === 0 ? 'СИНИЕ' : p.owner === 1 ? 'КРАСНЫЕ' : 'НЕЙТР.'}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {s.inPoint && s.alive && <div className="mono text-[11px] text-lime tracking-[0.2em] pulse mt-1">В ЗОНЕ ТОЧКИ {s.inPoint}</div>}
        {s.invuln > 0 && s.alive && <div className="mono text-[11px] text-team-blue tracking-[0.2em]">ЗАЩИТА {s.invuln.toFixed(1)} с</div>}
      </div>

      {/* ===== Лента убийств ===== */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
        {s.killfeed.map((k) => (
          <div key={k.id} className="mono text-[11px] text-olive-200 bg-olive-950/70 border-r-2 border-danger px-2 py-0.5 slide-in">{k.text}</div>
        ))}
      </div>

      {/* ===== Уведомления ===== */}
      <div className="absolute left-4 top-1/3 flex flex-col gap-1 max-w-[380px]">
        {s.notifications.map((n) => (
          <div
            key={n.id}
            className={`mono text-[12px] px-3 py-1.5 bg-olive-950/80 border-l-2 slide-in ${n.kind === 'good' ? 'border-lime text-lime' : n.kind === 'bad' ? 'border-danger text-danger' : n.kind === 'warn' ? 'border-amber text-amber' : n.kind === 'kill' ? 'border-lime text-olive-200' : 'border-olive-300 text-olive-200'}`}
          >
            {n.kind === 'kill' && <span className="text-lime mr-1">✕</span>}
            {n.text}
          </div>
        ))}
      </div>

      {/* ===== Левый низ: состояние танка ===== */}
      <div className="absolute left-4 bottom-4 flex flex-col gap-2 w-[300px]">
        {(s.boosts.speed > 0 || s.boosts.damage > 0) && (
          <div className="flex gap-2 mono text-[10px]">
            {s.boosts.speed > 0 && <div className="border border-[#5ad8ff] text-[#5ad8ff] px-2 py-0.5 bg-olive-950/80">ФОРСАЖ {s.boosts.speed.toFixed(0)} с</div>}
            {s.boosts.damage > 0 && <div className="border border-[#ff7a3c] text-[#ff7a3c] px-2 py-0.5 bg-olive-950/80">УРОН +30% {s.boosts.damage.toFixed(0)} с</div>}
          </div>
        )}
        <div className="panel p-3">
          <div className="flex justify-between items-baseline mono">
            <span className="text-[9px] tracking-[0.2em] text-olive-300">ПРОЧНОСТЬ</span>
            <span className="text-xl font-bold leading-none" style={{ color: hpColor }}>{s.hp}<span className="text-olive-400 text-xs"> / {s.maxHp}</span></span>
          </div>
          <div className="bar !h-2.5 mt-1"><i style={{ width: `${hpPct * 100}%`, background: hpColor }} /></div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Module label="ОРУДИЕ" icon="◎" v={s.modules.gun} broken={s.modules.gunBroken} />
            <Module label="ДВИГАТЕЛЬ" icon="⚙" v={s.modules.engine} broken={s.modules.engineBroken} />
            <Module label="ГУСЕНИЦЫ" icon="≋" v={s.modules.track} broken={s.modules.trackBroken} />
          </div>
          <div className="flex justify-between mono text-[10px] text-olive-300 mt-2">
            <span>СКОРОСТЬ</span>
            <span className="text-olive-200">{s.speedKmh.toFixed(0)} км/ч</span>
          </div>
        </div>
      </div>

      {/* ===== Низ центр: снаряды ===== */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-2">
        {SHELL_ORDER.map((id: ShellType, i) => {
          const sh = SHELLS[id];
          const active = s.shell === id;
          const col = '#' + sh.color.toString(16).padStart(6, '0');
          return (
            <div key={id} className={`relative w-[86px] px-2 py-1.5 bg-olive-950/85 border mono text-center transition-all ${active ? 'scale-105' : 'opacity-70'}`} style={{ borderColor: active ? col : 'rgba(142,160,140,0.3)' }}>
              <div className="absolute -top-2 left-1 text-[8px] text-olive-400 bg-olive-950 px-1">{i + 1}</div>
              <div className="text-[9px] tracking-widest" style={{ color: col }}>{sh.short}</div>
              <div className={`text-xl font-bold leading-none ${s.ammo[id] === 0 ? 'text-danger' : 'text-olive-200'}`}>{s.ammo[id]}</div>
              <div className="text-[8px] text-olive-400 leading-none mt-0.5">{sh.name.toUpperCase()}</div>
              {active && <div className="absolute left-0 right-0 bottom-0 h-0.5" style={{ background: col }} />}
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-[86px] left-1/2 -translate-x-1/2 w-[270px]">
        <div className="bar !h-1"><i style={{ width: `${reloadPct * 100}%`, background: s.canFire ? '#b9ff3d' : '#ffb424' }} /></div>
        <div className="flex justify-between mono text-[9px] text-olive-400 mt-0.5">
          <span>Q ◀</span>
          <span>{s.canFire ? 'ГОТОВ' : 'ПЕРЕЗАРЯДКА'}</span>
          <span>▶ E</span>
        </div>
      </div>

      {/* ===== Миникарта ===== */}
      <div className="absolute right-4 bottom-4">
        <div className="mono text-[9px] tracking-[0.2em] text-olive-300 mb-1 flex justify-between">
          <span>ТАКТИЧЕСКАЯ КАРТА</span>
          <span className="text-lime">{s.minimap.player.x.toFixed(0)} · {s.minimap.player.z.toFixed(0)}</span>
        </div>
        <canvas ref={mapRef} width={200} height={200} className="block" />
      </div>

      {/* ===== Смерть ===== */}
      {!s.alive && (
        <div className="absolute inset-0 flex items-center justify-center bg-danger/10">
          <div className="panel px-10 py-6 text-center border-danger/60">
            <div className="text-4xl font-bold tracking-[0.3em] text-danger glow-red">ТАНК УНИЧТОЖЕН</div>
            {s.mode === 'capture' ? (
              <>
                <div className="mono text-sm text-olive-300 mt-2 tracking-widest">ВОЗРОЖДЕНИЕ ЧЕРЕЗ</div>
                <div className="mono text-5xl font-bold text-lime mt-1">{Math.ceil(s.respawnIn)}</div>
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
}

function Module({ label, icon, v, broken }: { label: string; icon: string; v: number; broken: boolean }) {
  const col = broken ? '#ff4d4d' : v < 0.5 ? '#ffb424' : '#b9ff3d';
  return (
    <div className={`border px-1.5 py-1 mono text-center ${broken ? 'pulse' : ''}`} style={{ borderColor: col + '80' }}>
      <div className="text-base leading-none" style={{ color: col }}>{icon}</div>
      <div className="text-[8px] tracking-wider text-olive-300 mt-0.5">{label}</div>
      <div className="bar !h-1 mt-1"><i style={{ width: `${v * 100}%`, background: col }} /></div>
      <div className="text-[8px] mt-0.5" style={{ color: col }}>{broken ? 'РЕМОНТ' : v < 0.5 ? 'ПОВРЕЖД.' : 'НОРМА'}</div>
    </div>
  );
}
