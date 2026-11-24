import test from "node:test";
import assert from "node:assert/strict";
import { buildDentField } from "../src/utils/dentField.js";
import { pressureRimRadii, pressureRimPath } from "../src/utils/mallangRim.js";
import { createButtonDent } from "../src/utils/buttonDent.js";

test("rubbing the rim pushes outward in proportion to pressure", () => {
  const point = { x: 0.03, y: 0.5, depth: 1 };
  const deep = pressureRimRadii([point]);
  const shallow = pressureRimRadii([{ ...point, depth: 0.25 }]);
  assert(deep.every((radius) => radius >= 94));
  assert(deep[48] > 111);
  assert(shallow[48] > 94 && shallow[48] < deep[48]);
  assert(deep[0] < 94.01);
  assert(pressureRimRadii([{ x: 0.5, y: 0.5, depth: 1 }]).every((radius) => radius === 94));
  assert(!/NaN|Infinity/.test(pressureRimPath([point])));
});

test("the cubic contour also stays outside the original circle", () => {
  for (const angle of [0, 0.7, Math.PI, 4.1]) {
    const point = { x: 0.5 + Math.cos(angle) * 0.47, y: 0.5 + Math.sin(angle) * 0.47, depth: 1 };
    const numbers = pressureRimPath([point]).match(/-?\d+(?:\.\d+)?/g).map(Number);
    let start = numbers.slice(0, 2);
    for (let i = 2; i < numbers.length; i += 6) {
      const [x1, y1, x2, y2, x3, y3] = numbers.slice(i, i + 6);
      for (let t = 0; t <= 1; t += 0.1) {
        const u = 1 - t;
        const x = u ** 3 * start[0] + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3;
        const y = u ** 3 * start[1] + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3;
        assert(Math.hypot(x - 100, y - 100) >= 93.99);
      }
      start = [x3, y3];
    }
  }
});

const curve = [{ x: 0.3, y: 0.4, depth: 0.5 }, { x: 0.45, y: 0.45, depth: 0.75 }, { x: 0.6, y: 0.35, depth: 1 }];

test("moving the trail keeps a stable grid and smooth unsaturated distortion", () => {
  const field = buildDentField(curve, 200, 200, 64, 0.47);
  const moved = buildDentField([...curve, { x: 0.65, y: 0.4, depth: 1 }], 200, 200, 64, 0.47);
  assert.equal(field.columns, moved.columns);
  assert.equal(field.width, moved.width);
  let visibleShade = false;
  for (let row = 0; row < field.rows; row++) {
    for (let column = 0; column < field.columns; column++) {
      const p = (row * field.columns + column) * 4;
      assert(Math.abs(field.displacement[p] - 128) < 72);
      if (column) assert(Math.abs(field.displacement[p] - field.displacement[p - 4]) < 20);
      assert(field.shade[p + 3] <= 90);
      visibleShade ||= field.shade[p + 3] > 15;
      const x = field.left + (column + 0.5) * field.width / field.columns;
      const y = field.top + (row + 0.5) * field.height / field.rows;
      if (Math.hypot(x - 100, y - 100) >= 94) {
        assert.equal(field.displacement[p], 128);
        assert.equal(field.displacement[p + 1], 128);
        assert.equal(field.shade[p + 3], 0);
      }
    }
  }
  assert(visibleShade);
});

test("an outside pulled tip stays neutral and merges without a circular hole inside", () => {
  const field = buildDentField([{ x: 1, y: 0.5, depth: 1 }], 200, 200, 64, 0.47,
    { x: 1.04, y: 0.5, radius: 0.19 });
  for (let row = 0; row < field.rows; row++) {
    for (let column = 0; column < field.columns; column++) {
      const x = field.left + (column + 0.5) * field.width / field.columns;
      const y = field.top + (row + 0.5) * field.height / field.rows;
      if (Math.hypot(x - 208, y - 100) < 38) {
        const p = (row * field.columns + column) * 4;
        assert.equal(field.displacement[p], 128);
        assert.equal(field.displacement[p + 1], 128);
        assert.equal(field.shade[p + 3], 0);
      }
    }
  }
  const point = [{ x: 0.5, y: 0.5, depth: 1 }];
  const unprotected = buildDentField(point, 200, 200, 64, 0.47);
  const merged = buildDentField(point, 200, 200, 64, 0.47, { x: 0.5, y: 0.5, radius: 0.19 });
  assert.deepEqual(merged.shade, unprotected.shade);
});

test("faded and empty trails remove all pressure shading", () => {
  for (const points of [[], curve.map((point) => ({ ...point, depth: 0 }))]) {
    const field = buildDentField(points, 200, 200, 64, 0.47);
    for (let p = 0; p < field.displacement.length; p += 4) {
      assert.equal(field.displacement[p], 128);
      assert.equal(field.displacement[p + 1], 128);
      assert.equal(field.shade[p + 3], 0);
    }
  }
});

test("button dents get wider and darker under pressure without a second shaded ring", () => {
  const press = (depth) => buildDentField([{ x: .5, y: .5, depth }], 128, 44, 48);
  const deep = press(1), shallow = press(.22);
  function scan(field) {
    const row = Math.floor(field.rows / 2);
    return Array.from({ length: field.columns }, (_, col) =>
      field.shade[(row * field.columns + col) * 4 + 3]);
  }
  const strong = scan(deep), light = scan(shallow);
  const mid = Math.floor(deep.columns / 2);
  assert(strong[mid] > light[mid] && light[mid] > 0);
  assert(strong.filter(value => value > 2).length > light.filter(value => value > 2).length);
  for (const edge of [strong.slice(mid), strong.slice(0, mid).reverse()]) {
    assert(edge.every((value, i) => i === 0 || value <= edge[i - 1]));
    assert.equal(edge.at(-1), 0);
  }
});

test("the filter never clips a pulled tip outside the fixed depth grid", () => {
  const previousDocument = globalThis.document;
  const elements = [];
  const element = (tag) => {
    const result = { tag, style: {}, attributes: {}, append() {}, remove() {},
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; } };
    elements.push(result);
    return result;
  };
  globalThis.document = { body: element("body"), createElementNS: (_, tag) => element(tag),
    createElement: () => ({ width: 0, height: 0, toDataURL: () => "data:image/png;base64,test",
      getContext: () => ({ createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData() {} }) }) };
  try {
    const dent = createButtonDent({ surfaceRadius: 0.47, detailId: "test-face", detailPull: 3.5 });
    const filter = elements.find((item) => item.tag === "filter");
    for (const circle of [{ x: 1.14, y: 0.5 }, { x: -0.14, y: 0.5 }, { x: 0.5, y: -0.14 }, { x: 0.5, y: 1.14 }]) {
      dent.trace([{ ...circle, depth: 1 }], 200, 200, 64, { ...circle, radius: 0.2 });
      const attributes = filter.attributes;
      assert(attributes.x <= circle.x * 200 - 40);
      assert(attributes.y <= circle.y * 200 - 40);
      assert(attributes.x + attributes.width >= circle.x * 200 + 40);
      assert(attributes.y + attributes.height >= circle.y * 200 + 40);
    }
    const detail = elements.find((item) => item.tag === "filter" && item.attributes.id === "test-face");
    const detailMap = elements.find((item) => item.tag === "feDisplacementMap" && item.attributes.in2 === "detail-field");
    assert(detail);
    assert.equal(detailMap.attributes.scale, "3.50");
    dent.setDepth(0);
    assert.equal(detailMap.attributes.scale, "0.00");
    dent.dispose();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
