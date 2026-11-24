import { getMallangPalette, getMallangTheme, rgbColor } from "./mallangTheme.js";

const STORAGE_KEY = "codemyworld.mallang.customization";

export const MALLANG_EYES = [
  { id: "round", label: "동그란 눈" },
  { id: "oval", label: "타원 눈" },
  { id: "smile", label: "웃는 눈" },
  { id: "sleepy", label: "졸린 눈" },
  { id: "dot", label: "콩눈" },
  { id: "spark", label: "별눈" },
  { id: "wide", label: "넓은 눈" },
  { id: "wink", label: "윙크" },
];

export const MALLANG_MOUTHS = [
  { id: "w", label: "말랑 입" },
  { id: "smile", label: "미소" },
  { id: "open", label: "동그란 입" },
  { id: "pout", label: "삐죽 입" },
  { id: "grin", label: "활짝 입" },
  { id: "line", label: "일자 입" },
  { id: "kiss", label: "뽀뽀 입" },
  { id: "heart", label: "하트 입" },
];

const defaults = Object.freeze({
  eyes: "round", mouth: "w", theme: "rose",
});

let currentCustomization;

const validOption = (value, options, fallback) =>
  options.some(({ id }) => id === value) ? value : fallback;

function normalizeCustomization(value) {
  return {
    eyes: validOption(value?.eyes, MALLANG_EYES, defaults.eyes),
    mouth: validOption(value?.mouth, MALLANG_MOUTHS, defaults.mouth),
    theme: getMallangTheme(value?.theme).id,
  };
}

export function readMallangCustomization() {
  if (!currentCustomization) {
    try {
      currentCustomization = normalizeCustomization(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      currentCustomization = { ...defaults };
    }
  }
  return currentCustomization;
}

export function applySavedMallangTheme() {
  const theme = getMallangTheme(readMallangCustomization().theme);
  const palette = getMallangPalette(theme.id);
  const { dataset, style } = document.documentElement;
  dataset.mallangTheme = theme.id;
  style.setProperty("--mallang-theme-hue", theme.hue);
  style.setProperty("--accent", theme.accent);
  style.setProperty("--accent-rgb", theme.accent.slice(1).match(/../g).map((channel) => parseInt(channel, 16)).join(" "));
  style.setProperty("--mallang-eye", rgbColor(palette.eyes));
  style.setProperty("--mallang-mouth", rgbColor(palette.mouth));
  style.setProperty("--mallang-cheek", rgbColor(palette.cheeks));
  style.setProperty("--mallang-eye-glint", rgbColor(palette.eyeGlint));
}

export function saveMallangCustomization(value) {
  currentCustomization = normalizeCustomization(value);
  applySavedMallangTheme();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentCustomization));
  } catch {
    // Keep the chosen look for the current visit if storage is unavailable.
  }
  return currentCustomization;
}
