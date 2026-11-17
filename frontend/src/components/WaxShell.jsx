import { useId } from "react";

export default function WaxShell({ shell, center, radius, bodyStyle, onChipEnd }) {
  const id = useId();
  const intact = shell.pieces[0]?.depth === 0;
  const glossPoint = { x: center - radius * 0.33, y: center - radius * 0.49 };
  const waxEdge = "#ce6c98";
  if (!shell.pieces.length && !shell.chips.length) return null;

  return (
    <svg
      className="mallang-wax-shell"
      style={bodyStyle}
      viewBox={`0 0 ${center * 2} ${center * 2}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-wax`} gradientUnits="userSpaceOnUse"
          cx={center - radius * 0.3} cy={center - radius * 0.44} r={radius * 1.42}>
          <stop offset="0" stopColor="#ffe4ef" />
          <stop offset=".38" stopColor="#ffc0d9" />
          <stop offset=".78" stopColor="#f195bd" />
          <stop offset="1" stopColor="#df78a7" />
        </radialGradient>
        <radialGradient id={`${id}-gloss`}>
          <stop offset="0" stopColor="#fff4fa" stopOpacity=".88" />
          <stop offset=".5" stopColor="#fff4fa" stopOpacity=".52" />
          <stop offset="1" stopColor="#fff4fa" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-bevel`} x1="0%" y1="0%" x2="62%" y2="100%">
          <stop offset="0" stopColor="#fff6fa" />
          <stop offset=".46" stopColor="#ffdaea" />
          <stop offset="1" stopColor="#e78db5" />
        </linearGradient>
        <clipPath id={`${id}-surface`}>
          {intact
            ? <circle cx={center} cy={center} r={radius} />
            : shell.pieces.map((piece) => <polygon key={piece.id} points={piece.svgPoints} />)}
        </clipPath>
      </defs>
      {shell.chips.map((chip) => (
        <g className="mallang-wax-chip" key={chip.id} onAnimationEnd={() => onChipEnd(chip.id)}>
          <polygon points={chip.svgPoints} transform="translate(0 2.6)" fill={waxEdge} />
          <polygon points={chip.svgPoints} fill={`url(#${id}-wax)`}
            stroke={`url(#${id}-bevel)`} strokeWidth="1.8" strokeLinejoin="round" />
        </g>
      ))}
      {intact ? (
        <circle className="mallang-wax-intact" cx={center} cy={center} r={radius} fill={`url(#${id}-wax)`} />
      ) : (
        <>
          <g transform="translate(0 2.6)" fill={waxEdge} stroke={waxEdge} strokeWidth="2.2" strokeLinejoin="round">
            {shell.pieces.map((piece) => <polygon key={piece.id} points={piece.svgPoints} />)}
          </g>
          <g fill={`url(#${id}-wax)`} stroke={`url(#${id}-bevel)`} strokeWidth="2.2" strokeLinejoin="round">
            {shell.pieces.map((piece) => (
              <polygon key={piece.id} className="mallang-wax-piece" points={piece.svgPoints} />
            ))}
          </g>
        </>
      )}
      <g clipPath={`url(#${id}-surface)`} fill={`url(#${id}-gloss)`}>
        <ellipse cx={glossPoint.x} cy={glossPoint.y} rx={radius * 0.48} ry={radius * 0.16}
          transform={`rotate(-33 ${glossPoint.x} ${glossPoint.y})`} />
        <ellipse cx={center + radius * 0.52} cy={center + radius * 0.2}
          rx={radius * 0.17} ry={radius * 0.26} opacity=".45" />
      </g>
    </svg>
  );
}
