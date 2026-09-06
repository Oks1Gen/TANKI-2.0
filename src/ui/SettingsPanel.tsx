import { useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, QUALITY_NAMES, Quality, Settings, syncBodyQualityAttr } from '../game/settings';
import { audio } from '../game/audio';
import { Panel } from './common';

interface Props {
  compact?: boolean;
  onChanged?: (s: Settings) => void;
}

export default function SettingsPanel({ compact, onChanged }: Props) {
  const [s, setS] = useState<Settings>(() => {
    try {
      const loaded = loadSettings();
      try { syncBodyQualityAttr(loaded.quality); } catch { /* */ }
      return loaded;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  });

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    try { syncBodyQualityAttr(next.quality); } catch { /* */ }
    // громкость применяем сразу, остальное движок подхватит сам
    try {
      audio.init();
      audio.setVolume(next.volume);
    } catch { /* */ }
    onChanged?.(next);
  };

  const row = 'flex items-center gap-3 mt-3';
  const label = 'mono text-[10px] text-olive-300 tracking-wider uppercase w-32 shrink-0';
  const val = 'mono text-lime font-bold w-12 text-right shrink-0';

  return (
    <Panel title="Управление и звук" className={compact ? '!p-3' : ''}>
      <div className={row}>
        <span className={label}>Чувствительность</span>
        <input
          type="range"
          min={0.3}
          max={3}
          step={0.1}
          value={s.sensitivity}
          onChange={(e) => update({ sensitivity: +e.target.value })}
          className="flex-1 accent-lime"
        />
        <span className={val}>{s.sensitivity.toFixed(1)}×</span>
      </div>
      <div className={row}>
        <span className={label}>Громкость</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.volume}
          onChange={(e) => update({ volume: +e.target.value })}
          className="flex-1 accent-lime"
        />
        <span className={val}>{Math.round(s.volume * 100)}%</span>
      </div>
      <div className={row}>
        <span className={label}>Обзор (FOV)</span>
        <input
          type="range"
          min={55}
          max={75}
          step={1}
          value={s.fov}
          onChange={(e) => update({ fov: +e.target.value })}
          className="flex-1 accent-lime"
        />
        <span className={val}>{s.fov}°</span>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className={label}>Качество</span>
        <div className="flex gap-2 flex-1">
          {(['auto', 'low', 'high'] as Quality[]).map((q) => (
            <button
              key={q}
              onClick={() => update({ quality: q })}
              onMouseEnter={() => audio.ui('hover')}
              className={`chip flex-1 !px-2 !py-1.5 ${s.quality === q ? 'active' : ''}`}
              title={q === 'auto' ? 'Автодетект + автодеградация при просадках' : q === 'low' ? 'Без сглаживания и bloom, тени проще' : 'Максимум картинки'}
            >
              {QUALITY_NAMES[q]}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 mt-3 cursor-pointer mono text-[11px] text-olive-200">
        <input
          type="checkbox"
          checked={s.invertY}
          onChange={(e) => update({ invertY: e.target.checked })}
          className="accent-lime w-4 h-4"
        />
        Инверсия мыши по вертикали
      </label>
      {!compact && (
        <div className="mono text-[10px] text-olive-400 mt-3 leading-relaxed">
          Чувствительность, инверсия и FOV применяются сразу. Качество «Низкое/Высокое» перекрывает автодетект.
        </div>
      )}
    </Panel>
  );
}
