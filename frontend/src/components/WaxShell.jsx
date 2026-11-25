import { useId } from "react";
import { getMallangWaxPalette } from "../utils/mallangTheme";

function WaxPlate({ piece, waxFill, glossFill, colors }) {
  const { path, center, opening, isCrumb } = piece;
  const lifted = opening && !isCrumb && opening.lift > .45 ? 2.6 * opening.lift : 0;
  return (
    <g transform={opening && `translate(${center.x + opening.x} ${center.y + opening.y})
      rotate(${opening.turn}) scale(${opening.scale}) translate(${-center.x} ${-center.y})`}>
      {lifted && <path d={path} transform={`translate(0 ${lifted})`} fill={colors.edge} />}
      {opening && <path d={path} fill="none" stroke={colors.edge}
        strokeWidth={isCrumb ? 1.1 : 2.25} strokeLinejoin="round" />}
      <path d={path} fill={waxFill} stroke={opening ? colors.pieceLine : undefined}
        strokeWidth=".62" strokeLinejoin="round" />
      <path d={path} fill={glossFill} />
    </g>
  );
}

function WaxHairlines({ paths, color }) {
  return paths.map((path) => (
    <path key={path} className="mallang-wax-hairline" d={path} fill="none"
      stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  ));
}

export default function WaxShell({ shell, shellRef, themeId }) {
  const id = useId();
  const colors = getMallangWaxPalette(themeId);
  if (!shell.pieces.length && !shell.chips.length) return null;

  const { center, radius } = shell;
  const glossX = center - radius * .32, glossY = center - radius * .49;
  const platePaint = { waxFill: `url(#${id}-wax)`, glossFill: `url(#${id}-gloss)`, colors };

  return (
    <svg ref={shellRef} className="mallang-wax-shell" viewBox={`0 0 ${center * 2} ${center * 2}`} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-wax`} gradientUnits="userSpaceOnUse"
          cx={center - radius * .29} cy={center - radius * .47} r={radius * 1.44}>
          <stop offset="0" stopColor={colors.light} />
          <stop offset=".43" stopColor={colors.middle} />
          <stop offset=".8" stopColor={colors.rim} />
          <stop offset="1" stopColor={colors.dark} />
        </radialGradient>
        <radialGradient id={`${id}-gloss`} gradientUnits="userSpaceOnUse"
          cx={glossX} cy={glossY} r={radius * .5}
          gradientTransform={`translate(${glossX} ${glossY}) rotate(-33) scale(1 .34) translate(${-glossX} ${-glossY})`}>
          <stop offset="0" stopColor={colors.gloss} stopOpacity=".76" />
          <stop offset=".52" stopColor={colors.gloss} stopOpacity=".39" />
          <stop offset="1" stopColor={colors.gloss} stopOpacity="0" />
        </radialGradient>
      </defs>
      {shell.pieces.map((piece) => (
        <g key={piece.id} data-piece-id={piece.id} className="mallang-wax-piece">
          <WaxPlate piece={piece} {...platePaint} />
        </g>
      ))}
      {shell.preview && <WaxHairlines paths={shell.preview.hairlines} color={colors.crack} />}
      {shell.opening && (
        <g className="mallang-wax-opening">
          <WaxPlate piece={shell.intact} {...platePaint} />
          <WaxHairlines paths={shell.opening.hairlines} color={colors.crack} />
          {shell.opening.traces.map(({ path, delay }) => (
            <path key={path} className="mallang-wax-crack" d={path} pathLength="1" fill="none"
              stroke={colors.crack} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
              style={{ animationDelay: delay + "ms" }} />
          ))}
        </g>
      )}
      {shell.chips.map((chip) => {
        const sideways = (chip.center.x - center) * (chip.isCrumb ? .3 : .57) + (chip.drift ?? 0);
        const downward = (chip.isCrumb ? 24 : 49) + (chip.center.y - center) * .29;
        return (
          <g className={chip.isCrumb ? "mallang-wax-crumb" : "mallang-wax-chip"} key={chip.id} style={{
            "--wax-fade": chip.fadeMs + "ms",
            "--wax-fall-x": sideways + "px",
            "--wax-fall-y": downward + "px",
            "--wax-fall-turn": (sideways < 0 ? -21 : 21) + "deg",
          }}>
            <WaxPlate piece={chip} {...platePaint} />
          </g>
        );
      })}
    </svg>
  );
}
