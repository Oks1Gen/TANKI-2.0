import { ReactNode, MouseEvent, useEffect } from 'react';
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

export function Btn({ children, onClick, variant = 'default', className = '', disabled, title }: { children: ReactNode; onClick?: (e: MouseEvent) => void; variant?: 'default' | 'primary' | 'danger'; className?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={typeof children === 'string' ? children : title}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={`btn ${variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : ''} ${className}`}
      onMouseEnter={() => !disabled && audio.ui('hover')}
      onClick={(e) => {
        // Кнопка часто вложена в кликабельную карточку (выбор танка):
        // без stopPropagation клик всплывает и вторым setProgress затирает unlock.
        e.stopPropagation();
        if (disabled) return;
        audio.init();
        audio.ui(variant === 'primary' ? 'confirm' : 'click');
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}

export function Chip({ children, active, onClick, className = '' }: { children: ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active || undefined}
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
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[12px] mono mb-1">
        <span className="text-olive-300 uppercase tracking-wider">{label}</span>
        <span className="text-olive-200 tabular-nums">
          {Number.isInteger(value) ? value : value.toFixed(1)}
          {suffix}
        </span>
      </div>
      <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function Currency({ xp, gold }: { xp: number; gold: number }) {
  return (
    <div className="flex gap-2 mono text-sm">
      <div className="panel px-3 py-1.5 flex items-center gap-2" title="Свободный опыт для прокачки">
        <span className="text-lime text-[11px] tracking-widest font-bold">ОПЫТ</span>
        <span className="text-olive-200 font-semibold tabular-nums">{xp.toLocaleString('ru-RU')}</span>
      </div>
      <div className="panel px-3 py-1.5 flex items-center gap-2" title="Золото для ускорения и камуфляжей">
        <span className="text-amber text-[11px] tracking-widest font-bold">ЗОЛОТО</span>
        <span className="text-olive-200 font-semibold tabular-nums">{gold.toLocaleString('ru-RU')}</span>
      </div>
    </div>
  );
}

export function Corner() {
  // Отступ 6px внутрь — чтобы уголки не срезались скруглением .panel (radius 8px)
  return (
    <span aria-hidden className="pointer-events-none contents">
      <span className="absolute left-[6px] top-[6px] w-3 h-3 border-l border-t border-lime/60" />
      <span className="absolute right-[6px] top-[6px] w-3 h-3 border-r border-t border-lime/60" />
      <span className="absolute left-[6px] bottom-[6px] w-3 h-3 border-l border-b border-lime/60" />
      <span className="absolute right-[6px] bottom-[6px] w-3 h-3 border-r border-b border-lime/60" />
    </span>
  );
}

export function fmtTime(s: number) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Модалка в стиле PromotionModal: overlay + центрированная панель, закрытие по Esc/клику мимо. */
export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal-panel panel p-5 ${wide ? 'modal-wide' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="panel-title flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-lime" />
            {title}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="chip !px-2 !py-1">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Сегмент-контроль для табов правой колонки: одна рамка, иконка + подпись. */
export function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; icon: string; title?: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Разделы ангара" className="seg">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={o.title ?? o.label}
            className={`seg-btn ${active ? 'active' : ''}`}
            onClick={() => {
              audio.init();
              audio.ui('click');
              onChange(o.id);
            }}
          >
            <span aria-hidden className="seg-icon">
              {o.icon}
            </span>
            <span className="seg-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
