import test from "node:test";
import assert from "node:assert/strict";
import { getMallangPalette, MALLANG_THEMES, rgbColor } from "../src/utils/mallangTheme.js";

const storageKey = "codemyworld.mallang.customization";
const defaults = { eyes: "round", mouth: "w", theme: "rose" };

function mockCustomizationBrowser(t, initial) {
  const storage = new Map(initial ? [[storageKey, initial]] : []);
  const dataset = {};
  const styles = new Map();
  const originalStorage = globalThis.localStorage;
  const originalDocument = globalThis.document;
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value) };
  globalThis.document = { documentElement: { dataset, style: { setProperty: (name, value) => styles.set(name, value) } } };
  t.after(() => {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  return { storage, dataset, styles };
}

test("the saved face and app theme survive a fresh page load", async (t) => {
  const { dataset, styles } = mockCustomizationBrowser(t);
  const settings = await import("../src/utils/mallangCustomization.js?first-page");
  assert.deepEqual(settings.readMallangCustomization(), defaults);
  assert.equal(settings.MALLANG_EYES.length, 8);
  assert.equal(settings.MALLANG_MOUTHS.length, 8);
  const look = { eyes: "wink", mouth: "heart", theme: "mint" };
  const saved = settings.saveMallangCustomization(look);
  assert.equal(dataset.mallangTheme, "mint");
  assert.deepEqual(saved, look);
  const reloaded = await import("../src/utils/mallangCustomization.js?reloaded-page");
  assert.deepEqual(reloaded.readMallangCustomization(), saved);
  reloaded.applySavedMallangTheme();
  assert.equal(dataset.mallangTheme, "mint");
  assert.equal(styles.get("--accent-rgb"), "53 109 94");
  assert.equal(styles.get("--mallang-eye"), rgbColor(getMallangPalette("mint").eyes));
  assert.equal(styles.get("--mallang-cheek"), rgbColor(getMallangPalette("mint").cheeks));
});

test("old saved colors are ignored while valid face shapes are preserved", async (t) => {
  mockCustomizationBrowser(t, JSON.stringify({
    eyes: "unknown", mouth: "smile", eyeColor: "transparent", mouthColor: "#123456", theme: "obsolete",
  }));
  const settings = await import("../src/utils/mallangCustomization.js?invalid-preferences");
  assert.deepEqual(settings.readMallangCustomization(), { ...defaults, mouth: "smile" });
});

test("each theme has distinct app accents and character colors", () => {
  assert.equal(MALLANG_THEMES.length, 8);
  assert.equal(new Set(MALLANG_THEMES.map(({ accent }) => accent)).size, 8);
  for (const color of ["skin", "skinEdge", "groove", "cheeks", "waxMid"]) {
    assert.equal(new Set(MALLANG_THEMES.map(({ id }) => rgbColor(getMallangPalette(id)[color]))).size, 8);
  }
});
