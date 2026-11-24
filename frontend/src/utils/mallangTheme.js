export const MALLANG_THEMES = [
  { id: "rose", label: "딸기", hue: 337, accent: "#934361" },
  { id: "lavender", label: "라벤더", hue: 273, accent: "#704894" },
  { id: "sky", label: "하늘", hue: 207, accent: "#38648a" },
  { id: "mint", label: "민트", hue: 154, accent: "#356d5e" },
  { id: "apricot", label: "살구", hue: 15, accent: "#984b32" },
  { id: "lemon", label: "레몬", hue: 49, accent: "#765d19" },
  { id: "ocean", label: "바다", hue: 182, accent: "#286a72" },
  { id: "cocoa", label: "모카", hue: 30, accent: "#674935", saturation: .52 },
];

const [defaultTheme] = MALLANG_THEMES;
const rosePalette = {
  skin: [253, 207, 233],
  skinEdge: [241, 165, 206],
  skinLight: [253, 220, 241],
  flat: [255, 206, 223],
  groove: [177, 79, 127],
  gloss: [255, 246, 252],
  castShadow: [117, 50, 91],
  edgeFill: [246, 192, 223],
  edgeStroke: [179, 91, 133],
  eyes: [73, 32, 50],
  mouth: [145, 70, 95],
  cheeks: [219, 120, 155],
  eyeGlint: [255, 246, 251],
  waxFlat: [255, 206, 223],
  waxLight: [255, 232, 242],
  waxMid: [246, 204, 223],
  waxRim: [231, 165, 196],
  waxDark: [201, 125, 166],
  waxSheen: [255, 249, 253],
  waxShade: [122, 51, 88],
};

export function getMallangTheme(id) {
  return MALLANG_THEMES.find((theme) => theme.id === id) ?? defaultTheme;
}

function tintColor([red, green, blue], hueShift, saturation) {
  const highest = Math.max(red, green, blue);
  const lowest = Math.min(red, green, blue);
  const range = highest - lowest;
  if (!range) return [red, green, blue];
  const originalHue = highest === red ? (green - blue) / range
    : highest === green ? 2 + (blue - red) / range : 4 + (red - green) / range;
  const hue = ((originalHue + hueShift / 60) % 6 + 6) % 6;
  const chroma = range * saturation;
  const middle = chroma * (1 - Math.abs(hue % 2 - 1));
  const offset = (highest + lowest - chroma) / 2;
  const sectors = [[chroma, middle, 0], [middle, chroma, 0], [0, chroma, middle],
    [0, middle, chroma], [middle, 0, chroma], [chroma, 0, middle]];
  return sectors[Math.floor(hue)].map((channel) => Math.round(channel + offset));
}

const palettes = new Map(MALLANG_THEMES.map((theme) => [
  theme.id, theme === defaultTheme ? rosePalette : Object.fromEntries(
    Object.entries(rosePalette).map(([name, color]) => [
      name, tintColor(color, theme.hue - defaultTheme.hue, theme.saturation ?? 1),
    ]),
  ),
]));

export function getMallangPalette(id) {
  return palettes.get(id) ?? rosePalette;
}

export function rgbColor(channels, alpha = 1) {
  return `rgba(${channels.join(",")},${alpha})`;
}

export function tintMallangColor(hex, theme) {
  if (theme === defaultTheme) return hex;
  const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16));
  return rgbColor(tintColor(channels, theme.hue - defaultTheme.hue, theme.saturation ?? 1));
}
