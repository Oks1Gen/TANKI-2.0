import { ReactNode } from 'react';
import { audio } from '../game/audio';

export function Panel({ title, children, className = '', right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={`panel p-4 ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <div className="panel-title flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-lime" />
            {title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'default', className = '', disabled, title }: { children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'danger'; className?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      title={title}
      disabled={disabled}
      className={`btn ${variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : ''} ${className}`}
      onMouseEnter={() => !disabled && audio.ui('hover')}
      onClick={() => {
        if (disabled) return;
        audio.init();
        audio.ui(variant === 'primary' ? 'confirm' : 'click');
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function Chip({ children, active, onClick, className = '' }: { children: ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button
      className={`chip ${active ? 'active' : ''} ${className}`}
      onMouseEnter={() => audio.ui('hover')}
      onClick={() => {
        audio.init();
        audio.ui('click');
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function StatBar({ label, value, max, suffix = '', color = '#b9ff3d' }: { label: string; value: number; max: number; suffix?: string; color?: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] mono mb-1">
        <span className="text-olive-300 uppercase tracking-wider">{label}</span>
        <span className="text-olive-200">
          {Number.isInteger(value) ? value : value.toFixed(1)}
          {suffix}
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export function Currency({ xp, gold }: { xp: number; gold: number }) {
  return (
    <div className="flex gap-3 mono text-sm">
      <div className="panel px-3 py-1.5 flex items-center gap-2">
        <span className="text-lime text-[10px] tracking-widest">ОПЫТ</span>
        <span className="text-olive-200 font-semibold">{xp.toLocaleString('ru-RU')}</span>
      </div>
      <div className="panel px-3 py-1.5 flex items-center gap-2">
        <span className="text-amber text-[10px] tracking-widest">ЗОЛОТО</span>
        <span className="text-olive-200 font-semibold">{gold.toLocaleString('ru-RU')}</span>
      </div>
    </div>
  );
}

export function Corner() {
  return (
    <>
      <span className="absolute left-0 top-0 w-3 h-3 border-l border-t border-lime/60" />
      <span className="absolute right-0 top-0 w-3 h-3 border-r border-t border-lime/60" />
      <span className="absolute left-0 bottom-0 w-3 h-3 border-l border-b border-lime/60" />
      <span className="absolute right-0 bottom-0 w-3 h-3 border-r border-b border-lime/60" />
    </>
  );
}

export function fmtTime(s: number) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
