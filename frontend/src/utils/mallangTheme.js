export const MALLANG_THEMES = [
  {
    id: "rose", label: "딸기", hue: 337, accent: "#934361",
    app: { background: "#FDF2F6", surface: "#FAE8F0", softAccent: "#F7DCE9" },
  },
  {
    id: "lavender", label: "라벤더", hue: 273, accent: "#785395", saturation: .78,
    app: { background: "#F7F2FD", surface: "#F0E8FA", softAccent: "#EADDF6" },
    body: { skin: [232, 213, 251], skinEdge: [198, 167, 231], skinLight: [241, 229, 255], cheeks: [213, 137, 175] },
  },
  {
    id: "sky", label: "하늘", hue: 207, accent: "#3C6286", saturation: .74,
    app: { background: "#F0F7FD", surface: "#E5F1FB", softAccent: "#D8EAF8" },
    body: { skin: [203, 231, 251], skinEdge: [155, 198, 235], skinLight: [223, 242, 255], cheeks: [214, 143, 168] },
  },
  {
    id: "mint", label: "민트", hue: 154, accent: "#3C6F5D", saturation: .72,
    app: { background: "#EFF8F3", surface: "#E4F2EA", softAccent: "#D8EDE1" },
    body: { skin: [204, 239, 222], skinEdge: [156, 212, 191], skinLight: [225, 248, 237], cheeks: [214, 145, 155] },
  },
  {
    id: "apricot", label: "살구", hue: 15, accent: "#9C543E", saturation: .79,
    app: { background: "#FFF4ED", surface: "#FCEAE0", softAccent: "#F8DFD2" },
    body: { skin: [255, 220, 202], skinEdge: [242, 179, 150], skinLight: [255, 235, 221], cheeks: [221, 132, 120] },
  },
  {
    id: "lemon", label: "레몬", hue: 49, accent: "#7F6327", saturation: .85,
    app: { background: "#FCF7E9", surface: "#F9F0D9", softAccent: "#F5E9C7" },
    body: { skin: [255, 240, 191], skinEdge: [231, 204, 142], skinLight: [255, 247, 217], cheeks: [223, 150, 117] },
  },
  {
    id: "ocean", label: "바다", hue: 182, accent: "#31717B", saturation: .74,
    app: { background: "#EDF8FA", surface: "#E2F2F4", softAccent: "#D3EBEE" },
    body: { skin: [198, 233, 237], skinEdge: [142, 201, 210], skinLight: [221, 245, 247], cheeks: [205, 132, 151] },
  },
  {
    id: "cocoa", label: "모카", hue: 30, accent: "#795343", saturation: .59,
    app: { background: "#F8F1EC", surface: "#F2E7E0", softAccent: "#EBDCD1" },
    body: { skin: [238, 219, 203], skinEdge: [213, 179, 159], skinLight: [248, 234, 223], cheeks: [183, 116, 104] },
  },
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

const roseWaxPalette = {
  light: "#ffe3ee",
  middle: "#f3bfd6",
  rim: "#dc8bb3",
  dark: "#ad507e",
  gloss: "#fff6fc",
  edge: "#9a4d76",
  pieceLine: "#fdd4e8",
  crack: "#813858",
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

function createBodyPalette(theme) {
  if (theme === defaultTheme) return rosePalette;
  const tinted = Object.fromEntries(Object.entries(rosePalette).map(([name, color]) => [
    name, tintColor(color, theme.hue - defaultTheme.hue, theme.saturation),
  ]));
  const { skin, skinEdge } = theme.body;
  return {
    ...tinted,
    ...theme.body,
    flat: skin,
    edgeFill: skin.map((channel, index) => Math.round((channel + 2 * skinEdge[index]) / 3)),
    eyes: rosePalette.eyes,
    mouth: rosePalette.mouth,
    eyeGlint: rosePalette.eyeGlint,
  };
}

function createWaxPalette(theme) {
  if (theme === defaultTheme) return roseWaxPalette;
  return Object.fromEntries(Object.entries(roseWaxPalette).map(([name, hex]) => {
    const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16));
    return [name, rgbColor(tintColor(channels, theme.hue - defaultTheme.hue, theme.saturation))];
  }));
}

const palettes = new Map(MALLANG_THEMES.map((theme) => [theme.id, createBodyPalette(theme)]));
const waxPalettes = new Map(MALLANG_THEMES.map((theme) => [theme.id, createWaxPalette(theme)]));

export function getMallangPalette(id) {
  return palettes.get(id) ?? rosePalette;
}

export function getMallangWaxPalette(id) {
  return waxPalettes.get(id) ?? roseWaxPalette;
}

export function rgbColor(channels, alpha = 1) {
  return `rgba(${channels.join(",")},${alpha})`;
}
