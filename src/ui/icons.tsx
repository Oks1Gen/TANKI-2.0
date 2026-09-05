import { Biome, TimeOfDay, Weather } from '../game/config';

/**
 * Плоские контурные пиктограммы в штабной стилистике: один штрих currentColor,
 * без эмодзи и заливок. Цвет задаёт родитель (lime — актив, olive — покой).
 */
function Svg({ children, size = 26 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

function SunRays({ r1, r2, angles }: { r1: number; r2: number; angles: number[] }) {
  const cx = 12;
  const cy = 12;
  return (
    <g>
      {angles.map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={cx + Math.cos(rad) * r1}
            y1={cy + Math.sin(rad) * r1}
            x2={cx + Math.cos(rad) * r2}
            y2={cy + Math.sin(rad) * r2}
          />
        );
      })}
    </g>
  );
}

const ALL8 = [0, 45, 90, 135, 180, 225, 270, 315];

export function BiomeIcon({ biome, size }: { biome: Biome; size?: number }) {
  switch (biome) {
    case 'forest':
      return (
        <Svg size={size}>
          <path d="M7 15 L7 7 M7 7 L4.2 11.5 M7 7 L9.8 11.5" />
          <path d="M4 15 L7 9.5 L10 15 Z" />
          <line x1="7" y1="15" x2="7" y2="18.5" />
          <path d="M15.5 15 L15.5 10 M15.5 10 L13.6 13 M15.5 10 L17.4 13" />
          <path d="M13.2 15 L15.5 11 L17.8 15 Z" />
          <line x1="15.5" y1="15" x2="15.5" y2="18.5" />
          <line x1="2.5" y1="20.5" x2="21.5" y2="20.5" />
        </Svg>
      );
    case 'desert':
      return (
        <Svg size={size}>
          <circle cx="17" cy="6" r="2.4" />
          <path d="M2.5 16 Q7.5 9.5 12.5 14.5 T21.5 13" />
          <path d="M2.5 20 Q9 15.5 15 18.5 T21.5 17.5" />
        </Svg>
      );
    case 'winter':
      return (
        <Svg size={size}>
          <line x1="12" y1="3.5" x2="12" y2="20.5" />
          <line x1="4.5" y1="7.8" x2="19.5" y2="16.2" />
          <line x1="19.5" y1="7.8" x2="4.5" y2="16.2" />
          <path d="M12 3.5 L10 5.5 M12 3.5 L14 5.5 M12 20.5 L10 18.5 M12 20.5 L14 18.5" />
        </Svg>
      );
    case 'mountains':
      return (
        <Svg size={size}>
          <path d="M2.5 19 L8.5 7.5 L12.5 14 L15.5 9.5 L21.5 19" />
          <path d="M7 10.2 L8.5 7.5 L10 10.2" />
          <line x1="2.5" y1="19" x2="21.5" y2="19" />
        </Svg>
      );
  }
}

export function WeatherIcon({ weather, size }: { weather: Weather; size?: number }) {
  switch (weather) {
    case 'clear':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="4.2" />
          <SunRays r1={6.2} r2={8.4} angles={ALL8} />
        </Svg>
      );
    case 'rain':
      return (
        <Svg size={size}>
          <ellipse cx="12" cy="9.5" rx="6.5" ry="4" />
          <line x1="8" y1="15.5" x2="6.8" y2="19.5" />
          <line x1="12.2" y1="15.5" x2="11" y2="19.5" />
          <line x1="16.4" y1="15.5" x2="15.2" y2="19.5" />
        </Svg>
      );
    case 'fog':
      return (
        <Svg size={size}>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="6.5" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="17.5" y2="17" />
        </Svg>
      );
    case 'snow':
      return (
        <Svg size={size}>
          <ellipse cx="12" cy="8.5" rx="6.5" ry="4" />
          <circle cx="8" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="12.5" cy="19" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="17" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'storm':
      return (
        <Svg size={size}>
          <ellipse cx="12" cy="8.5" rx="6.5" ry="4" />
          <path d="M13 12.5 L9.5 17.5 H12.5 L11.5 21.5 L15.5 16 H12.5 Z" fill="currentColor" strokeWidth={1.2} />
        </Svg>
      );
  }
}

export function TimeIcon({ time, size }: { time: TimeOfDay; size?: number }) {
  switch (time) {
    case 'night':
      return (
        <Svg size={size}>
          <path d="M20 13.5 A8 8 0 1 1 10.5 4 A6.5 6.5 0 0 0 20 13.5 Z" />
          <path d="M17.5 3.5 L18.1 5.2 L19.8 5.8 L18.1 6.4 L17.5 8.1 L16.9 6.4 L15.2 5.8 L16.9 5.2 Z" fill="currentColor" strokeWidth={1} />
        </Svg>
      );
    case 'dawn':
      return (
        <Svg size={size}>
          <path d="M8 16.5 A4 4 0 0 1 16 16.5" />
          <line x1="12" y1="7" x2="12" y2="9.5" />
          <line x1="6.8" y1="9" x2="8.2" y2="10.8" />
          <line x1="17.2" y1="9" x2="15.8" y2="10.8" />
          <line x1="3" y1="16.5" x2="21" y2="16.5" />
          <line x1="5" y1="20" x2="19" y2="20" />
        </Svg>
      );
    case 'morning':
      return (
        <Svg size={size}>
          <circle cx="12" cy="10.5" r="3.2" />
          <line x1="12" y1="3.5" x2="12" y2="5.3" />
          <line x1="5.8" y1="6" x2="7.2" y2="7.2" />
          <line x1="18.2" y1="6" x2="16.8" y2="7.2" />
          <line x1="3" y1="17" x2="21" y2="17" />
          <line x1="6" y1="20.5" x2="18" y2="20.5" />
        </Svg>
      );
    case 'day':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="4" />
          <SunRays r1={6} r2={8} angles={ALL8} />
        </Svg>
      );
    case 'noon':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="3.6" />
          <SunRays r1={5.8} r2={9.6} angles={ALL8} />
        </Svg>
      );
    case 'evening':
      return (
        <Svg size={size}>
          <circle cx="12" cy="13.5" r="3.2" />
          <line x1="12" y1="6.5" x2="12" y2="8.3" />
          <line x1="7.2" y1="8" x2="8.4" y2="9.4" />
          <line x1="16.8" y1="8" x2="15.6" y2="9.4" />
          <line x1="3" y1="17" x2="21" y2="17" />
          <line x1="6" y1="20.5" x2="18" y2="20.5" />
        </Svg>
      );
    case 'sunset':
      return (
        <Svg size={size}>
          <path d="M8 16.5 A4 4 0 0 0 16 16.5" />
          <line x1="8.5" y1="11.5" x2="11" y2="11.5" />
          <line x1="13" y1="11.5" x2="15.5" y2="11.5" />
          <line x1="3" y1="16.5" x2="21" y2="16.5" />
          <line x1="5" y1="20" x2="19" y2="20" />
        </Svg>
      );
    case 'dusk':
      return (
        <Svg size={size}>
          <path d="M16.5 3 A5.5 5.5 0 1 0 18 12.5 A4.4 4.4 0 0 1 16.5 3 Z" />
          <line x1="18.5" y1="16" x2="20.5" y2="16" />
          <line x1="19.5" y1="15" x2="19.5" y2="17" />
          <line x1="3" y1="20" x2="14" y2="20" />
        </Svg>
      );
  }
}
