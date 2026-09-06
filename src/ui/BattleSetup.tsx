import { BattleConfig, BIOMES, BIOME_NAMES, TIMES, TIME_NAMES, WEATHERS, WEATHER_NAMES, MODE_NAMES, GameMode, Duration, DURATION_NAMES, DURATION_SECONDS, TANKS, TankId, BOT_DIFFICULTIES, BOT_DIFFICULTY_NAMES, BOT_DIFFICULTY_SPECS, BotDifficulty, TimeOfDay, getTeamCounts } from '../game/config';
import { REWARD_TEXT } from '../game/economy';
import { getDarkFactor, TIME_PRESETS, LIGHTS_DARK_THRESHOLD } from '../game/world';
import { Panel, Btn, Chip, Corner, fmtTime } from './common';
import { BiomeIcon, WeatherIcon, TimeIcon } from './icons';
import SettingsPanel from './SettingsPanel';

type Setup = Pick<BattleConfig, 'mode' | 'bots' | 'botDifficulty' | 'biome' | 'time' | 'weather' | 'duration'>;

interface Props {
  setup: Setup;
  setSetup: (s: Setup) => void;
  tank: TankId;
  onBack: () => void;
  onStart: () => void;
}

const skyHex = (t: TimeOfDay) => '#' + TIME_PRESETS[t].sky.toString(16).padStart(6, '0');

export default function BattleSetup({ setup, setSetup, tank, onBack, onStart }: Props) {
  // Состав команд — из общего хелпера с движком (раньше формула была скопирована в двух местах).
  const { red, blue } = getTeamCounts(setup.bots, setup.mode);
  const timeIdx = Math.max(0, TIMES.indexOf(setup.time));
  const dark = getDarkFactor(setup.time, setup.weather);
  const lightsOn = dark > LIGHTS_DARK_THRESHOLD;

  const stepTime = (d: number) => {
    const next = Math.max(0, Math.min(TIMES.length - 1, timeIdx + d));
    if (TIMES[next] !== setup.time) setSetup({ ...setup, time: TIMES[next] });
  };

  return (
    <div className="w-full h-full grid-bg relative flex flex-col fade-in">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-lime/15 bg-olive-900/70 flex-wrap">
        <div className="min-w-0">
          <h1 className="display-md !text-[24px] tracking-[0.22em] leading-none truncate">НАСТРОЙКА БОЯ</h1>
          <div className="caption mt-1">Параметры операции · {TANKS[tank].name} · {TANKS[tank].role}</div>
        </div>
        <Btn onClick={onBack}>◀ В ангар</Btn>
      </header>

      <div className="setup-grid">
        <div className="flex flex-col gap-3 min-h-0">
          <Panel title="Режим боя">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['deathmatch', 'capture'] as GameMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSetup({ ...setup, mode: m })}
                  aria-pressed={setup.mode === m}
                  className={`relative cursor-pointer border rounded-lg p-4 text-left transition-all ${setup.mode === m ? 'border-lime bg-lime/10' : 'border-olive-500/40 bg-olive-900/50 hover:border-olive-300/60'}`}
                >
                  {setup.mode === m && <Corner />}
                  <div className="text-xl font-bold text-olive-200">{MODE_NAMES[m]}</div>
                  <div className="body-md !text-[13px] mt-1 leading-snug">
                    {m === 'deathmatch'
                      ? 'Каждый сам за себя. Без возрождений. Уничтожьте всех противников, чтобы победить.'
                      : 'Командный бой за три точки A, B, C. Возрождения включены. Побеждает команда, набравшая больше очков по таймеру.'}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-olive-500/30 bg-olive-950/40 p-3">
              <div className="flex items-center gap-3">
                <span className="caption w-28 shrink-0">Противники</span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={setup.bots}
                  onChange={(e) => setSetup({ ...setup, bots: +e.target.value })}
                  className="flex-1"
                  aria-label="Количество ботов"
                  aria-valuetext={setup.bots === 0 ? 'тренировка без ботов' : `${setup.bots} ботов`}
                />
                <span className="mono text-lime font-bold w-8 text-right tabular-nums" aria-hidden>{setup.bots}</span>
              </div>
              {setup.bots === 0 ? (
                <div className="mono text-[11px] text-lime mt-2 tracking-wider">ТРЕНИРОВКА — свободная практика без противников и наград за фраги</div>
              ) : (
                <div className="mt-2.5">
                  <TeamDots red={red} blue={blue} mode={setup.mode} />
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="caption mb-2">Сложность ботов</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {BOT_DIFFICULTIES.map((d: BotDifficulty) => (
                  <Chip key={d} active={(setup.botDifficulty ?? 'veteran') === d} onClick={() => setSetup({ ...setup, botDifficulty: d })} className="!py-2.5 text-center">
                    <div className="font-bold text-[13px]">{BOT_DIFFICULTY_NAMES[d]}</div>
                    <div className="mono text-[11px] text-olive-300 mt-0.5 leading-snug normal-case tracking-normal">{BOT_DIFFICULTY_SPECS[d].desc}</div>
                  </Chip>
                ))}
              </div>
            </div>
            {setup.mode === 'capture' && (
              <div className="mt-4">
                <div className="caption mb-2">Длительность боя</div>
                <div className="flex gap-2 flex-wrap">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BIOMES.map((b) => (
                <Chip key={b} active={setup.biome === b} onClick={() => setSetup({ ...setup, biome: b })} className="!py-3 text-center">
                  <span className="flex flex-col items-center gap-1.5">
                    <BiomeIcon biome={b} />
                    {BIOME_NAMES[b]}
                  </span>
                </Chip>
              ))}
            </div>
          </Panel>

          <Panel title="Время суток" right={<span className="caption !text-lime">{TIME_NAMES[setup.time]}</span>}>
            {/* Карусель-слайдер ночь → сумерки вместо сетки 8 кнопок */}
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => stepTime(-1)} disabled={timeIdx <= 0} aria-label="Раньше" className="chip !px-2.5 shrink-0">◀</button>
              <input
                type="range"
                min={0}
                max={TIMES.length - 1}
                step={1}
                value={timeIdx}
                onChange={(e) => {
                  const t = TIMES[+e.target.value] ?? setup.time;
                  if (t !== setup.time) setSetup({ ...setup, time: t });
                }}
                className="flex-1"
                aria-label="Время суток"
                aria-valuetext={TIME_NAMES[setup.time]}
              />
              <button type="button" onClick={() => stepTime(1)} disabled={timeIdx >= TIMES.length - 1} aria-label="Позже" className="chip !px-2.5 shrink-0">▶</button>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-olive-500/30 bg-olive-950/40 p-3">
              <span className="text-lime" aria-hidden>
                <TimeIcon time={setup.time} size={34} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[16px] text-olive-200">{TIME_NAMES[setup.time]}</div>
                <div className="mono text-[11px] text-olive-400 mt-0.5">
                  {TIME_PRESETS[setup.time].night ? 'Тёмное время' : `Солнце ×${TIME_PRESETS[setup.time].sunI}`} · затемнение {Math.round(dark * 100)}%
                </div>
              </div>
              <span
                className={`mono text-[11px] px-2 py-1 rounded-full border tracking-[0.12em] shrink-0 ${lightsOn ? 'border-lime/60 text-lime bg-lime/10' : 'border-olive-500/40 text-olive-400'}`}
                title="Фары танков включаются при затемнении выше 35% — так же считает движок боя"
              >
                {lightsOn ? 'ФАРЫ ВКЛ' : 'ФАРЫ ВЫКЛ'}
              </span>
            </div>
            {/* Превью освещения строкой: цвета неба из пресетов движка */}
            <div className="mt-3">
              <div className="flex rounded-full overflow-hidden border border-olive-500/30" role="img" aria-label={`Освещение: сейчас ${TIME_NAMES[setup.time]}`}>
                {TIMES.map((t) => (
                  <div
                    key={t}
                    className="flex-1 h-2.5 transition-all"
                    style={{
                      background: skyHex(t),
                      outline: t === setup.time ? '2px solid #b9ff3d' : 'none',
                      outlineOffset: '-2px',
                      zIndex: t === setup.time ? 1 : 0,
                    }}
                    title={TIME_NAMES[t]}
                  />
                ))}
              </div>
              <div className="relative h-4" aria-hidden>
                <span
                  className="absolute top-0 mono text-lime text-[12px]"
                  style={{ left: `${((timeIdx + 0.5) / TIMES.length) * 100}%`, transform: 'translateX(-50%)' }}
                >
                  ▲
                </span>
              </div>
              <div className="flex justify-between caption">
                <span>Ночь</span>
                <span>День</span>
                <span>Сумерки</span>
              </div>
            </div>
          </Panel>

          <Panel title="Погода">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {WEATHERS.map((w) => (
                <Chip key={w} active={setup.weather === w} onClick={() => setSetup({ ...setup, weather: w })} className="!py-3 text-center">
                  <span className="flex flex-col items-center gap-1.5">
                    <WeatherIcon weather={w} />
                    {WEATHER_NAMES[w]}
                  </span>
                </Chip>
              ))}
            </div>
          </Panel>

          <SettingsPanel />
        </div>

        <div className="setup-summary flex flex-col gap-3 min-h-0">
          <Panel title="Сводка операции" className="flex-1">
            <div className="mono text-[12px] space-y-2">
              <Row k="Машина" v={`${TANKS[tank].name} · ${TANKS[tank].role}`} />
              <Row k="Режим" v={MODE_NAMES[setup.mode]} />
              <Row k="Противники" v={setup.bots === 0 ? 'Тренировка (нет)' : setup.mode === 'capture' ? `${red} красных` : `${setup.bots} ботов`} />
              <Row k="Сложность" v={BOT_DIFFICULTY_NAMES[setup.botDifficulty ?? 'veteran']} />
              {setup.mode === 'capture' && <Row k="Союзники" v={`${blue} синих + вы`} />}
              {setup.mode === 'capture' && <Row k="Таймер" v={fmtTime(DURATION_SECONDS[setup.duration])} />}
              <Row k="Биом" v={BIOME_NAMES[setup.biome]} />
              <Row k="Время" v={TIME_NAMES[setup.time]} />
              <Row k="Погода" v={WEATHER_NAMES[setup.weather]} />
            </div>
            <div className="divider my-3" />
            {/* Награда — тарифы из economy.ts, тот же источник, что считает движок */}
            <div className="caption mb-2">Награда</div>
            <div className="mono text-[12px] space-y-2">
              <Row k="Фраг" v={REWARD_TEXT.kill} />
              <Row k="Урон ×100" v={REWARD_TEXT.damage100} />
              {setup.mode === 'capture' && <Row k="Захват" v={REWARD_TEXT.capture} />}
              {setup.mode === 'deathmatch' && <Row k="Выживание" v={REWARD_TEXT.survival} />}
              <Row k="Победа" v={REWARD_TEXT.win} />
              <Row k="Ничья / Поражение" v={REWARD_TEXT.drawLose} />
            </div>
            <div className="mt-3 text-[12px] text-olive-300 leading-relaxed border-t border-olive-500/30 pt-3">
              Выход в бой — бесплатно. Итоговая награда зависит от результата: фраги, урон{setup.mode === 'capture' ? ', захваты' : ''} и исход боя.
            </div>
            <div className="mt-3 text-[12px] text-olive-300 leading-relaxed">
              {setup.weather === 'fog' && 'Туман сильно снижает видимость — держитесь ближе к укрытиям и цельтесь по маркерам.'}
              {setup.weather === 'storm' && 'Гроза: ливень, ветер, вспышки молний. Освещение драматичное, обзор ограничен.'}
              {setup.weather === 'rain' && 'Дождь слегка затемняет сцену и ухудшает дальний обзор.'}
              {setup.weather === 'snow' && 'Снегопад. Холодная атмосфера, умеренное снижение видимости.'}
              {setup.weather === 'clear' && 'Ясная погода: максимальная видимость, дальние дуэли.'}
              {lightsOn && ' Темно: включены фары и подсветка техники.'}
            </div>
          </Panel>
          {/* Единственный CTA экрана — с ценой и наградой в подписи */}
          <Btn variant="primary" className="text-lg !py-4" onClick={onStart}>
            ▶ Выдвигаться в бой
          </Btn>
          <div className="mono text-[11px] text-olive-400 text-center leading-relaxed -mt-1">
            Бесплатно · награда по итогам боя
          </div>
        </div>
      </div>
    </div>
  );
}

/** Живой состав команд синими/красными точками — те же числа, что уйдут в движок. */
function TeamDots({ red, blue, mode }: { red: number; blue: number; mode: GameMode }) {
  const dot = (color: string, title: string, key: string | number) => (
    <span
      key={key}
      title={title}
      className="w-2.5 h-2.5 rounded-full shrink-0 inline-block"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
  const you = (title: string) => (
    <span
      title={title}
      className="w-2.5 h-2.5 rounded-full shrink-0 inline-block"
      style={{ background: 'rgba(185,255,61,0.3)', border: '2px solid #b9ff3d', boxShadow: '0 0 8px rgba(185,255,61,0.6)' }}
    />
  );
  if (mode === 'capture') {
    return (
      <div className="flex items-center gap-3 flex-wrap" role="img" aria-label={`Состав команд: синие ${blue + 1} против красных ${red}`}>
        <span className="flex items-center gap-1.5">
          <span className="flex gap-1 flex-wrap max-w-[140px]">
            {Array.from({ length: blue }).map((_, i) => dot('#4aa3ff', `Союзник-бот ${i + 1}`, `b${i}`))}
            {you('Вы — за синих')}
          </span>
          <span className="mono text-[11px] text-team-blue tabular-nums">Синие ×{blue + 1}</span>
        </span>
        <span className="mono text-[11px] text-olive-500" aria-hidden>VS</span>
        <span className="flex items-center gap-1.5">
          <span className="flex gap-1 flex-wrap max-w-[160px]">
            {Array.from({ length: red }).map((_, i) => dot('#ff5a5a', `Противник ${i + 1}`, `r${i}`))}
          </span>
          <span className="mono text-[11px] text-team-red tabular-nums">Красные ×{red}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 flex-wrap" role="img" aria-label={`${red} противников, каждый сам за себя`}>
      <span className="flex gap-1 flex-wrap max-w-[280px]">
        {Array.from({ length: red }).map((_, i) => dot('#ff5a5a', `Противник ${i + 1}`, i))}
      </span>
      <span className="mono text-[11px] text-olive-300 tabular-nums">Противники ×{red}</span>
      <span className="flex items-center gap-1.5">
        {you('Вы')}
        <span className="mono text-[11px] text-olive-400">Вы · каждый сам за себя</span>
      </span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-olive-500/20 pb-1">
      <span className="text-olive-400 uppercase text-[11px] tracking-wider shrink-0">{k}</span>
      <span className="text-olive-200 text-right">{v}</span>
    </div>
  );
}
