import test from "node:test";
import assert from "node:assert/strict";
import { roundDentPath } from "../src/utils/dentPath.js";
import { buildDentField } from "../src/utils/dentField.js";

test("right-angle paths get rounded corners without overshooting their bounds", () => {
  const points = [{ x: 0.2, y: 0.2, depth: 0.4 }, { x: 0.8, y: 0.2, depth: 0.7 }, { x: 0.8, y: 0.8, depth: 1 }];
  const path = roundDentPath(points, 200, 200, 3);
  assert.deepEqual(path[0], { x: 40, y: 40, depth: 0.4 });
  assert.deepEqual(path.at(-1), { x: 160, y: 160, depth: 1 });
  let largestTurn = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1];
    const first = Math.atan2(b.y - a.y, b.x - a.x);
    const second = Math.atan2(c.y - b.y, c.x - b.x);
    largestTurn = Math.max(largestTurn, Math.abs(Math.atan2(Math.sin(second - first), Math.cos(second - first))));
    assert(b.x >= 40 && b.x <= 160 && b.y >= 40 && b.y <= 160);
    assert(b.depth >= 0.4 && b.depth <= 1);
  }
  assert(largestTurn < Math.PI / 6);
  assert(path.every((point) => Math.hypot(point.x - 160, point.y - 40) > 5));
});

test("duplicates, reversals and long trails stay finite with bounded sampling", () => {
  assert.deepEqual(roundDentPath([], 200, 200), []);
  const path = roundDentPath([{ x: 0.2, y: 0.5, depth: 0.3 }, { x: 0.2, y: 0.5, depth: 1 },
    { x: 0.8, y: 0.5, depth: 0.8 }, { x: 0.2, y: 0.5, depth: 0.6 }], 200, 200);
  assert(path.every((point) => Number.isFinite(point.x) && Number.isFinite(point.depth)));
  assert.equal(path[0].depth, 1);
  const long = roundDentPath(Array.from({ length: 40 }, (_, i) => ({ x: i % 2, y: i / 40, depth: 1 })), 200, 200);
  assert(long.length <= 130);
});

test("the face's limited displacement cannot fold even across a sharp path reversal", () => {
  const field = buildDentField([{ x: 0.25, y: 0.4, depth: 1 }, { x: 0.7, y: 0.4, depth: 1 },
    { x: 0.35, y: 0.55, depth: 0.8 }, { x: 0.65, y: 0.6, depth: 1 }], 200, 200, 70, 0.47);
  const stepX = field.width / field.columns;
  const stepY = field.height / field.rows;
  const scale = 3.5 / 255;
  let hasLocalMovement = false;
  const channel = (x, y, component) => field.displacement[(y * field.columns + x) * 4 + component];
  for (let y = 1; y < field.rows - 1; y++) {
    for (let x = 1; x < field.columns - 1; x++) {
      const xx = (channel(x + 1, y, 0) - channel(x - 1, y, 0)) * scale / (2 * stepX);
      const xy = (channel(x, y + 1, 0) - channel(x, y - 1, 0)) * scale / (2 * stepY);
      const yx = (channel(x + 1, y, 1) - channel(x - 1, y, 1)) * scale / (2 * stepX);
      const yy = (channel(x, y + 1, 1) - channel(x, y - 1, 1)) * scale / (2 * stepY);
      assert((1 + xx) * (1 + yy) - xy * yx > 0.7);
      const movement = Math.abs(channel(x, y, 0) - 128) * scale;
      assert(movement < 1);
      hasLocalMovement ||= movement > 0.2;
    }
  }
  assert(hasLocalMovement);
});
