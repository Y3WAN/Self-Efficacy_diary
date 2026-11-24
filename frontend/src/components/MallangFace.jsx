function Eye({ variant, isLeft }) {
  const color = "var(--mallang-eye)";
  if (variant === "smile" || (variant === "wink" && isLeft)) {
    return <path d="M-7 1 Q0 -8 7 1" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" />;
  }
  if (variant === "sleepy") {
    return <path d="M-7 -1 Q0 5 7 -1" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" />;
  }
  if (variant === "dot") return <circle r="3.6" fill={color} />;
  if (variant === "spark") {
    return <path d="M0 -8 Q2 -2 8 0 Q2 2 0 8 Q-2 2 -8 0 Q-2 -2 0 -8Z" fill={color} />;
  }
  const sizes = { oval: [5.2, 7.3], wide: [8, 4.8] };
  const [rx, ry] = sizes[variant] ?? [6.2, 6.2];
  return <>
    <ellipse rx={rx} ry={ry} fill={color} />
    <circle cx="-2" cy="-2" r="1.8" fill="var(--mallang-eye-glint)" />
  </>;
}

export function MallangEyes({ variant }) {
  return [86, 114].map((x) => (
    <g key={x} data-surface-point={x + " 94"}>
      <g transform={"translate(" + x + " 94)"}>
        <Eye variant={variant} isLeft={x === 86} />
      </g>
    </g>
  ));
}

const mouthPaths = {
  w: "M90 113 Q89 122 96 121 Q100 121 100 115 Q100 122 105 121 Q112 122 110 113",
  smile: "M89 113 Q100 127 111 113",
  open: "M92 114 C92 107 108 107 108 114 C108 126 92 126 92 114Z",
  pout: "M91 118 Q95 113 100 116 Q105 113 109 118",
  grin: "M88 111 Q100 116 112 111 Q108 123 100 123 Q92 123 88 111Z",
  line: "M93 116 H107",
  kiss: "M99 110 C108 109 109 115 102 116 C109 117 108 123 99 122",
  heart: "M100 112 C94 106 88 112 92 117 L100 124 L108 117 C112 112 106 106 100 112Z",
};

export function MallangMouth({ variant }) {
  const color = "var(--mallang-mouth)";
  const filled = variant === "open" || variant === "grin" || variant === "heart";
  return <path data-surface-point="100 117" d={mouthPaths[variant]} stroke={color} strokeWidth="2.5"
    fill={filled ? color : "none"} strokeLinecap="round" strokeLinejoin="round" />;
}

export default function MallangFace({ look, x, y, size }) {
  return <svg aria-hidden="true" viewBox="0 0 200 200" x={x} y={y} width={size} height={size}>
    <ellipse data-surface-point="63 115" cx="63" cy="115" rx="19" ry="10"
      fill="var(--mallang-cheek)" opacity="var(--mallang-cheek-opacity)" />
    <ellipse data-surface-point="137 115" cx="137" cy="115" rx="19" ry="10"
      fill="var(--mallang-cheek)" opacity="var(--mallang-cheek-opacity)" />
    <MallangEyes variant={look.eyes} />
    <MallangMouth variant={look.mouth} />
  </svg>;
}
