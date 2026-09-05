// ===== Процедурные текстуры ангара (без внешних ассетов) =====
import * as THREE from 'three';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function toTex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Пол ангара 1024²: бетон + швы + масляные пятна + жёлтая разметка + трафарет 01 */
export function concreteFloorTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(1024, 1024);
  const rnd = rng(1234);
  // база
  ctx.fillStyle = '#22271f';
  ctx.fillRect(0, 0, 1024, 1024);
  // крупная неоднородность
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 1024;
    const y = rnd() * 1024;
    const r = 40 + rnd() * 150;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.5;
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,240,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // мелкий шум
  for (let i = 0; i < 9000; i++) {
    const v = rnd();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.015 + rnd() * 0.03})` : `rgba(0,0,0,${0.03 + rnd() * 0.06})`;
    ctx.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  // деформационные швы
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * 1024;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * 1024 + 3;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
  }
  // трещины
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = rnd() * 1024;
    let y = rnd() * 1024;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * 90;
      y += (rnd() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // масляные пятна (тёмные с радужным ободком)
  for (let i = 0; i < 16; i++) {
    const x = 300 + rnd() * 424;
    const y = 300 + rnd() * 424;
    const r = 8 + rnd() * 42;
    ctx.fillStyle = 'rgba(8,8,10,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,180,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, r + 2, r * (0.5 + rnd() * 0.5) + 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // следы гусениц к центру
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 26;
  ctx.setLineDash([40, 26]);
  ctx.beginPath(); ctx.moveTo(512, 1024); ctx.lineTo(470, 560); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(512, 1024); ctx.lineTo(554, 560); ctx.stroke();
  ctx.setLineDash([]);

  // парковочная разметка: жёлтый прямоугольник вокруг центра
  ctx.strokeStyle = 'rgba(201,162,39,0.85)';
  ctx.lineWidth = 8;
  ctx.strokeRect(262, 300, 500, 430);
  // прерывистая внутренняя
  ctx.strokeStyle = 'rgba(201,162,39,0.35)';
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 18]);
  ctx.strokeRect(282, 320, 460, 390);
  ctx.setLineDash([]);
  // трафарет "01" на полу
  ctx.fillStyle = 'rgba(201,162,39,0.5)';
  ctx.font = 'bold 120px "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('01', 512, 250);
  // стрелка направления выезда
  ctx.fillStyle = 'rgba(185,255,61,0.28)';
  ctx.beginPath();
  ctx.moveTo(512, 90); ctx.lineTo(552, 150); ctx.lineTo(528, 150);
  ctx.lineTo(528, 195); ctx.lineTo(496, 195); ctx.lineTo(496, 150); ctx.lineTo(472, 150);
  ctx.closePath(); ctx.fill();

  return toTex(c);
}

/** Профлист стен: вертикальные рёбра + ржавчина */
export function corrugatedTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  const rnd = rng(77);
  ctx.fillStyle = '#2a3129';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, '#1b211b');
    g.addColorStop(0.35, '#333d32');
    g.addColorStop(0.55, '#3d4a3a');
    g.addColorStop(0.8, '#272e26');
    g.addColorStop(1, '#161b16');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, 256);
  }
  // ржавые потёки сверху вниз
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256;
    const y0 = rnd() * 80;
    const len = 40 + rnd() * 180;
    const w = 2 + rnd() * 7;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(140,80,30,${0.12 + rnd() * 0.22})`);
    g.addColorStop(1, 'rgba(140,80,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, w, len);
  }
  // заклёпки
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let x = 8; x < 256; x += 16) {
    ctx.beginPath(); ctx.arc(x, 246, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, 10, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = 8; x < 256; x += 16) {
    ctx.beginPath(); ctx.arc(x - 0.7, 245.3, 1, 0, Math.PI * 2); ctx.fill();
  }
  // грязь снизу
  const g2 = ctx.createLinearGradient(0, 190, 0, 256);
  g2.addColorStop(0, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 190, 256, 66);
  return toTex(c, true);
}

/** Тёмный металл балок */
export function darkMetalTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(128, 128);
  const rnd = rng(9);
  ctx.fillStyle = '#1e2420';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 4, 1);
  }
  ctx.fillStyle = 'rgba(140,80,30,0.12)';
  for (let i = 0; i < 8; i++) ctx.fillRect(rnd() * 128, rnd() * 128, 3 + rnd() * 8, 2 + rnd() * 4);
  return toTex(c, true);
}

/** Дерево ящиков */
export function woodTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  const rnd = rng(4242);
  ctx.fillStyle = '#5d4a2e';
  ctx.fillRect(0, 0, 256, 256);
  for (let b = 0; b < 4; b++) {
    const y = b * 64;
    ctx.fillStyle = b % 2 ? '#66522f' : '#584627';
    ctx.fillRect(0, y + 2, 256, 60);
    // волокна
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const yy = y + 4 + rnd() * 56;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, yy + (rnd() - 0.5) * 6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, y, 256, 2);
  }
  // потёртости
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 8, 1 + rnd() * 3);
  }
  return toTex(c, true);
}

/** Чёрно-жёлтая hazard-полоса */
export function hazardTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#141412';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 128); ctx.lineTo(i + 64, 0); ctx.lineTo(i + 80, 0); ctx.lineTo(i + 16, 128);
    ctx.closePath(); ctx.fill();
  }
  // износ
  const rnd = rng(5);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
    ctx.fillRect(rnd() * 128, rnd() * 128, 2 + rnd() * 5, 1 + rnd() * 3);
  }
  const t = toTex(c, true);
  return t;
}

/** Брезент */
export function tarpTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  const rnd = rng(31);
  ctx.fillStyle = '#4b5238';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 4) {
    const s = Math.sin(x * 0.15) * 12 + Math.sin(x * 0.05) * 18;
    ctx.fillStyle = s > 0 ? 'rgba(255,255,240,0.05)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(x, 0, 2, 256);
  }
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 248);
  return toTex(c, true);
}

/** Прозрачный трафарет-текст для стен (белая/жёлтая краска) */
export function stencilTexture(lines: string[], color = 'rgba(220,225,210,0.85)', w = 512, h = 256): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(w, h);
  const rnd = rng(lines.join('').length * 131 + 7);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((line, i) => {
    const fs = Math.min(120, (h / (n + 0.5)) * 0.85);
    ctx.font = `bold ${fs}px "Arial Narrow", sans-serif`;
    // ручной трекинг
    ctx.fillText(line.split('').join('  '), w / 2, (h / (n + 1)) * (i + 1));
  });
  // потёртости краски
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Агит-плакат */
export function posterTexture(kind: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 360);
  const bg = kind === 0 ? '#5a1f1a' : kind === 1 ? '#22331e' : '#1d2a3a';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 344);
  // звезда
  ctx.fillStyle = '#c9a227';
  const cx = 128;
  const cy = 120;
  const R = 52;
  const r = 21;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? R : r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8e4d4';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px "Arial Narrow", sans-serif';
  ctx.fillText(kind === 0 ? 'ВПЕРЁД!' : kind === 1 ? 'К БОЮ!' : 'ЗА СТАЛЬ!', 128, 230);
  ctx.font = 'bold 22px "Arial Narrow", sans-serif';
  ctx.fillStyle = '#c9a227';
  ctx.fillText(kind === 0 ? 'ЭКИПАЖ · МАШИНА · ПОБЕДА' : kind === 1 ? 'АНГАР 01 · РЕМБАТ' : 'БРОНЯ КРЕПКА', 128, 268);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * 256, Math.random() * 360, 2, 2);
  return toTex(c);
}

/** Табличка-стенд ТТХ рядом с танком */
export function infoBoardTexture(title: string, rows: string[]): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 320);
  ctx.fillStyle = '#0c100d';
  ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = '#b9ff3d';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 308);
  ctx.fillStyle = '#b9ff3d';
  ctx.font = 'bold 34px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(title.slice(0, 18), 24, 52);
  ctx.font = '20px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8ea08c';
  rows.slice(0, 8).forEach((row, i) => {
    ctx.fillText(row.slice(0, 30), 24, 96 + i * 28);
  });
  // сканлайны
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 320; y += 4) ctx.fillRect(0, y, 512, 1);
  return toTex(c);
}

/** Радиальный glow для ламп */
export function glowTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.25, 'rgba(255,220,150,0.55)');
  g.addColorStop(0.6, 'rgba(255,200,120,0.16)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
