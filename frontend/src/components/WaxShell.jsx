import { useId, useMemo } from "react";
import { getMallangTheme, tintMallangColor } from "../utils/mallangTheme";

const waxColors = {
  edge: "#ce6c98",
  light: "#f6c8dc",
  middle: "#eba8c6",
  rim: "#d77da8",
  dark: "#b9588a",
  gloss: "#fff4fa",
  dent: "#64264c",
  dentRim: "#8f3f70",
  dentGloss: "#fff0f7",
  pieceLine: "#f9c7dd",
  chipLine: "#ffdaea",
};

export default function WaxShell({ shell, center, radius, shellRef, onChipEnd, themeId }) {
  const id = useId();
  const colors = useMemo(() => {
    const theme = getMallangTheme(themeId);
    return Object.fromEntries(Object.entries(waxColors).map(([name, hex]) => [name, tintMallangColor(hex, theme)]));
  }, [themeId]);
  if (!shell.pieces.length && !shell.chips.length) return null;

  const glossPoint = { x: center - radius * 0.33, y: center - radius * 0.49 };
  const waxFill = `url(#${id}-wax)`;

  return (
    <svg
      ref={shellRef} className="mallang-wax-shell"
      viewBox={`0 0 ${center * 2} ${center * 2}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-wax`} gradientUnits="userSpaceOnUse"
          cx={center - radius * 0.3} cy={center - radius * 0.44} r={radius * 1.42}>
          <stop offset="0" stopColor={colors.light} />
          <stop offset=".38" stopColor={colors.middle} />
          <stop offset=".78" stopColor={colors.rim} />
          <stop offset="1" stopColor={colors.dark} />
        </radialGradient>
        <radialGradient id={`${id}-gloss`}>
          <stop offset="0" stopColor={colors.gloss} stopOpacity=".88" />
          <stop offset=".5" stopColor={colors.gloss} stopOpacity=".52" />
          <stop offset="1" stopColor={colors.gloss} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-dent`} cx="42%" cy="40%">
          <stop offset="0" stopColor={colors.dent} stopOpacity=".69" />
          <stop offset=".57" stopColor={colors.dentRim} stopOpacity=".22" />
          <stop offset=".91" stopColor={colors.dentGloss} stopOpacity=".45" />
          <stop offset="1" stopColor={colors.dentGloss} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-surface`}>
          {shell.pieces.map((piece) => <path key={piece.id} d={piece.path} transform={piece.transform} />)}
        </clipPath>
        <clipPath id={`${id}-body`}>
          <circle cx={center} cy={center} r={radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-body)`}>
        {shell.pieces.map((piece) => (
          <g key={piece.id} data-piece-id={piece.id} className="mallang-wax-piece">
          <g transform={piece.transform}>
            <path d={piece.path} transform="translate(0 1.8)" fill={colors.edge} />
            <path d={piece.path} fill={waxFill} stroke={colors.pieceLine} strokeWidth={piece.depth ? 0.65 : 0} strokeLinejoin="round" />
          </g>
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
            <path d={chip.path} transform="translate(0 2.6)" fill={colors.edge} />
            <path d={chip.path} fill={waxFill} stroke={colors.chipLine} strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        ))}
      </g>
    </svg>
  );
}
