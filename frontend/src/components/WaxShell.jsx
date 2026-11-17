import { useId } from "react";
import { PRESS_TILT } from "../utils/surfacePress";

export default function WaxShell({ shell, center, radius, contactRef, onChipEnd }) {
  const id = useId();
  if (!shell.pieces.length && !shell.chips.length) return null;

  const intact = shell.fractures === 0;
  const glossPoint = { x: center - radius * 0.33, y: center - radius * 0.49 };
  const waxEdge = "#ce6c98";
  const waxFill = `url(#${id}-wax)`;
  const tilt = PRESS_TILT * 180 / Math.PI;

  return (
    <svg
      className="mallang-wax-shell"
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
        <radialGradient id={`${id}-dent`} cx="42%" cy="40%">
          <stop offset="0" stopColor="#64264c" stopOpacity=".69" />
          <stop offset=".57" stopColor="#8f3f70" stopOpacity=".22" />
          <stop offset=".91" stopColor="#fff0f7" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff0f7" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-surface`}>
          {shell.pieces.map((piece) => <path key={piece.id} d={piece.path} transform={piece.transform} />)}
        </clipPath>
        <clipPath id={`${id}-body`}>
          <circle cx={center} cy={center} r={radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-body)`}>
        {intact ? (
          <circle className="mallang-wax-intact" cx={center} cy={center} r={radius} fill={waxFill} />
        ) : shell.pieces.map((piece) => (
          <g key={piece.id} className="mallang-wax-piece" transform={piece.transform}>
            <path d={piece.path} transform="translate(0 1.8)" fill={waxEdge} />
            <path d={piece.path} fill={waxFill} />
          </g>
        ))}
        <g clipPath={`url(#${id}-surface)`} fill={`url(#${id}-gloss)`}>
          <ellipse cx={glossPoint.x} cy={glossPoint.y} rx={radius * 0.48} ry={radius * 0.16}
            transform={`rotate(-33 ${glossPoint.x} ${glossPoint.y})`} />
          <ellipse cx={center + radius * 0.52} cy={center + radius * 0.2}
            rx={radius * 0.17} ry={radius * 0.26} opacity=".45" />
        </g>
        {shell.chips.map((chip) => (
          <g className="mallang-wax-chip" key={chip.id} style={{ "--wax-fade": chip.fadeMs + "ms" }}
            onAnimationEnd={() => onChipEnd(chip.id)}>
            <path d={chip.path} transform="translate(0 2.6)" fill={waxEdge} />
            <path d={chip.path} fill={waxFill} stroke="#ffdaea" strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        ))}
        <g ref={contactRef} visibility="hidden">
          <ellipse rx="1" ry="1" transform={`rotate(${tilt})`} fill={`url(#${id}-dent)`} />
        </g>
      </g>
    </svg>
  );
}
