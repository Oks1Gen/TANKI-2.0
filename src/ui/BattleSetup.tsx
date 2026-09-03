import { BattleConfig, BIOMES, BIOME_NAMES, TIMES, TIME_NAMES, WEATHERS, WEATHER_NAMES, MODE_NAMES, GameMode, Duration, DURATION_NAMES, DURATION_SECONDS, TANKS, TankId } from '../game/config';
import { Panel, Btn, Chip, Corner, fmtTime } from './common';

type Setup = Pick<BattleConfig, 'mode' | 'bots' | 'biome' | 'time' | 'weather' | 'duration'>;

interface Props {
  setup: Setup;
  setSetup: (s: Setup) => void;
  tank: TankId;
  onBack: () => void;
  onStart: () => void;
}

const BIOME_ICON: Record<string, string> = { forest: '🌲', desert: '🏜', winter: '❄', mountains: '⛰' };
const WEATHER_ICON: Record<string, string> = { clear: '☀', rain: '🌧', fog: '🌫', snow: '🌨', storm: '⛈' };
const TIME_ICON: Record<string, string> = { night: '🌙', dawn: '🌄', morning: '🌅', day: '☀', noon: '🔆', evening: '🌇', sunset: '🌆', dusk: '🌃' };

export default function BattleSetup({ setup, setSetup, tank, onBack, onStart }: Props) {
  const red = Math.ceil((setup.bots + 1) / 2);
  const blue = setup.bots - red;
  return (
    <div className="w-full h-full grid-bg relative flex flex-col fade-in scanlines">
      <header className="flex items-center justify-between px-6 py-3 border-b border-lime/15 bg-olive-900/70">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.25em] text-olive-200 leading-none">НАСТРОЙКА БОЯ</h1>
          <div className="mono text-[10px] tracking-[0.3em] text-lime-dim mt-1">ПАРАМЕТРЫ ОПЕРАЦИИ · ПОДГОТОВКА К ВЫХОДУ</div>
        </div>
        <Btn onClick={onBack}>◀ В ангар</Btn>
      </header>

      <div className="flex-1 grid grid-cols-[1fr_340px] gap-4 p-4 min-h-0">
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          <Panel title="Режим боя">
            <div className="grid grid-cols-2 gap-3">
              {(['deathmatch', 'capture'] as GameMode[]).map((m) => (
                <div
                  key={m}
                  onClick={() => setSetup({ ...setup, mode: m })}
                  className={`relative cursor-pointer border p-4 ${setup.mode === m ? 'border-lime bg-lime/10' : 'border-olive-500/40 bg-olive-900/50 hover:border-olive-300/60'}`}
                >
                  {setup.mode === m && <Corner />}
                  <div className="text-xl font-bold text-olive-200">{MODE_NAMES[m]}</div>
                  <div className="text-xs text-olive-300 mt-1 leading-snug">
                    {m === 'deathmatch'
                      ? 'Каждый сам за себя. Без возрождений. Уничтожьте всех противников, чтобы победить.'
                      : 'Командный бой за три точки A, B, C. Возрождения включены. Побеждает команда, набравшая больше очков по таймеру.'}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4">
              <span className="mono text-[10px] text-olive-300 tracking-wider uppercase w-32">Количество ботов</span>
              <input type="range" min={1} max={12} value={setup.bots} onChange={(e) => setSetup({ ...setup, bots: +e.target.value })} className="flex-1 accent-lime" />
              <span className="mono text-lime font-bold w-8 text-right">{setup.bots}</span>
            </div>
            {setup.mode === 'capture' && (
              <div className="mt-4">
                <div className="mono text-[10px] text-olive-300 tracking-wider uppercase mb-2">Длительность боя</div>
                <div className="flex gap-2">
                  {(['short', 'medium', 'long'] as Duration[]).map((d) => (
                    <Chip key={d} active={setup.duration === d} onClick={() => setSetup({ ...setup, duration: d })}>
                      {DURATION_NAMES[d]} · {fmtTime(DURATION_SECONDS[d])}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Биом">
            <div className="grid grid-cols-4 gap-2">
              {BIOMES.map((b) => (
                <Chip key={b} active={setup.biome === b} onClick={() => setSetup({ ...setup, biome: b })} className="!py-3 text-center">
                  <div className="text-xl mb-1">{BIOME_ICON[b]}</div>
                  {BIOME_NAMES[b]}
                </Chip>
              ))}
            </div>
          </Panel>

          <Panel title="Время суток">
            <div className="grid grid-cols-8 gap-2">
              {TIMES.map((t) => (
                <Chip key={t} active={setup.time === t} onClick={() => setSetup({ ...setup, time: t })} className="!py-3 text-center !px-1">
                  <div className="text-lg mb-1">{TIME_ICON[t]}</div>
                  {TIME_NAMES[t]}
                </Chip>
              ))}
            </div>
          </Panel>

          <Panel title="Погода">
            <div className="grid grid-cols-5 gap-2">
              {WEATHERS.map((w) => (
                <Chip key={w} active={setup.weather === w} onClick={() => setSetup({ ...setup, weather: w })} className="!py-3 text-center">
                  <div className="text-xl mb-1">{WEATHER_ICON[w]}</div>
                  {WEATHER_NAMES[w]}
                </Chip>
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          <Panel title="Сводка операции" className="flex-1">
            <div className="mono text-[12px] space-y-2">
              <Row k="Машина" v={`${TANKS[tank].name} · ${TANKS[tank].role}`} />
              <Row k="Режим" v={MODE_NAMES[setup.mode]} />
              <Row k="Противники" v={setup.mode === 'capture' ? `${red} красных` : `${setup.bots} ботов`} />
              {setup.mode === 'capture' && <Row k="Союзники" v={`${blue} синих + вы`} />}
              {setup.mode === 'capture' && <Row k="Таймер" v={fmtTime(DURATION_SECONDS[setup.duration])} />}
              <Row k="Биом" v={BIOME_NAMES[setup.biome]} />
              <Row k="Время" v={TIME_NAMES[setup.time]} />
              <Row k="Погода" v={WEATHER_NAMES[setup.weather]} />
            </div>
            <div className="mt-4 text-[11px] text-olive-300 leading-relaxed border-t border-olive-500/30 pt-3">
              {setup.weather === 'fog' && 'Туман сильно снижает видимость — держитесь ближе к укрытиям и цельтесь по маркерам.'}
              {setup.weather === 'storm' && 'Гроза: ливень, ветер, вспышки молний. Освещение драматичное, обзор ограничен.'}
              {setup.weather === 'rain' && 'Дождь слегка затемняет сцену и ухудшает дальний обзор.'}
              {setup.weather === 'snow' && 'Снегопад. Холодная атмосфера, умеренное снижение видимости.'}
              {setup.weather === 'clear' && 'Ясная погода: максимальная видимость, дальние дуэли.'}
              {(setup.time === 'night' || setup.time === 'dusk') && ' В темноте включаются фары и подсветка окон.'}
            </div>
          </Panel>
          <Btn variant="primary" className="text-lg !py-4" onClick={onStart}>
            ▶ Выдвигаться в бой
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-olive-500/20 pb-1">
      <span className="text-olive-400 uppercase text-[10px] tracking-wider">{k}</span>
      <span className="text-olive-200">{v}</span>
    </div>
  );
}
