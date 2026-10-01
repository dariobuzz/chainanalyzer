import type { RiskLevel } from "@/types/domain";
import { RISK_LEVELS } from "@/lib/constants";
import { RISK_STYLE } from "@/components/shared";

/** Semi-circular 0–100 gauge, segmented by the five ChainScope risk bands. */
export function RiskGauge({ score, level, size = 240 }: { score: number; level: RiskLevel; size?: number }) {
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = size * 0.55;
  const r = size * 0.42;
  const stroke = size * 0.07;
  const gap = 1.2; // degrees between bands

  const polar = (deg: number) => {
    const rad = ((180 - deg) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(from);
    const [x2, y2] = polar(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const toDeg = (v: number) => (Math.max(0, Math.min(100, v)) / 100) * 180;
  const [nx, ny] = polar(toDeg(score));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} role="img" aria-label={`Risk score ${score} of 100, ${level}`}>
      {RISK_LEVELS.map((b) => {
        const active = b.level === level;
        return (
          <path
            key={b.level}
            d={arc(toDeg(b.min === 0 ? 0 : b.min - 0.5) + gap / 2, toDeg(b.max + 0.5) - gap / 2)}
            stroke={RISK_STYLE[b.level].color}
            strokeOpacity={active ? 1 : 0.18}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="butt"
          />
        );
      })}
      <circle cx={nx} cy={ny} r={stroke * 0.62} fill="#fff" stroke={RISK_STYLE[level].color} strokeWidth={3} />
      <text x={cx} y={cy - r * 0.18} textAnchor="middle" className="tabular" style={{ fontSize: size * 0.2, fontWeight: 600, fill: "#0f1b2d" }}>
        {score}
      </text>
      <text x={cx} y={cy + 2} textAnchor="middle" style={{ fontSize: size * 0.055, fill: "#6b7385", letterSpacing: "0.06em" }}>
        OUT OF 100
      </text>
      <text x={cx - r} y={cy + stroke * 1.1} textAnchor="middle" style={{ fontSize: size * 0.048, fill: "#8a91a1" }}>
        0
      </text>
      <text x={cx + r} y={cy + stroke * 1.1} textAnchor="middle" style={{ fontSize: size * 0.048, fill: "#8a91a1" }}>
        100
      </text>
    </svg>
  );
}
