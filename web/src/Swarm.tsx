import { memo, useMemo } from "react";
/** Deterministic vector particles: one eye, no image download and no animation loop. */
export const Swarm = memo(function Swarm({ pulse }: { pulse: number }) {
  const dots = useMemo(() => {
    const points: {
      x: number;
      y: number;
      r: number;
      opacity: number;
      gold: boolean;
    }[] = [];
    let seed = 1771;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 1750; i++) {
      const x = rand() * 560 - 280,
        y = rand() * 310 - 155;
      const outer =
        Math.pow(Math.abs(x) / 280, 1.4) + Math.pow(Math.abs(y) / 142, 1.7);
      const distance = Math.hypot(x, y * 1.02);
      const iris = distance > 55 && distance < 112;
      const lid = outer < 1 && outer > 0.72;
      if (iris || lid || (outer < 1 && rand() < 0.12))
        points.push({
          x: x + 320,
          y: y + 210,
          r: rand() * 1.5 + 0.6,
          opacity: iris ? rand() * 0.65 + 0.3 : rand() * 0.6 + 0.15,
          gold: distance < 65,
        });
    }
    for (let i = 0; i < 100; i++) {
      const a = rand() * Math.PI * 2,
        r = 175 + rand() * 160;
      points.push({
        x: 320 + Math.cos(a) * r,
        y: 210 + Math.sin(a) * r * 0.55,
        r: rand() + 0.5,
        opacity: rand() * 0.24,
        gold: false,
      });
    }
    return points;
  }, []);
  return (
    <div className="swarm-art" aria-hidden="true">
      <svg
        key={pulse}
        className={pulse ? "swarm-eye pulse" : "swarm-eye"}
        viewBox="0 0 640 420"
        fill="none"
      >
        <defs>
          <radialGradient id="eye-glow">
            <stop stopColor="#8B7BFF" stopOpacity=".2" />
            <stop offset="1" stopColor="#8B7BFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="iris">
            <stop stopColor="#8B7BFF" stopOpacity="0" />
            <stop offset=".7" stopColor="#8B7BFF" stopOpacity=".05" />
            <stop offset="1" stopColor="#8B7BFF" stopOpacity=".2" />
          </radialGradient>
        </defs>
        <ellipse cx="320" cy="210" rx="310" ry="190" fill="url(#eye-glow)" />
        <circle cx="320" cy="210" r="102" fill="url(#iris)" />
        <g>
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={d.gold ? "#FFC83D" : "#A698FF"}
              opacity={d.opacity}
            />
          ))}
        </g>
        <circle
          cx="320"
          cy="210"
          r="51"
          stroke="#8B7BFF"
          strokeOpacity=".45"
          strokeDasharray="1 6"
        />
        <circle cx="320" cy="210" r="26" fill="#07070B" />
        <path
          d="M307 210h26m-13-13v26"
          stroke="#FFC83D"
          strokeWidth="1"
          opacity=".8"
        />
      </svg>
      <div className="eye-caption">
        <span className="signal-dot" />
        The swarm is listening
      </div>
    </div>
  );
});
