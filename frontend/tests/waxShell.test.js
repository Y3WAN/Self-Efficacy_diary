import test from "node:test";
import assert from "node:assert/strict";
import { containsWaxPiece, createWaxShell, fractureWaxShell, markWaxShell, waxKeyboardPoint } from "../src/utils/waxShell.js";

const center = { x: 100, y: 100 };
const radius = 94;
const markAndBreak = (shell, point) => fractureWaxShell(markWaxShell(shell, point), point);

test("a light crack marks the intact shell without shedding pieces", () => {
  const intact = createWaxShell(center.x, radius, 42);
  assert.equal(intact.pieces.length, 1);
  assert.equal(fractureWaxShell(intact, center), null);

  const marked = markWaxShell(intact, center);
  assert.equal(marked.preview.hairlines.length, 2);
  assert.equal(marked.pieces[0], intact.pieces[0]);
  assert.equal(marked.fractures, 0);
  assert.equal(marked.chips.length, 0);
  assert.equal(intact.preview, null);
  assert.equal(markWaxShell(marked, { x: 50, y: 50 }), marked);
  assert.equal(fractureWaxShell(marked, { x: 0, y: 0 }), null);
});

test("a sustained fracture partitions the whole shell and leaves the contact on one plate", () => {
  for (const impact of [center, { x: 74, y: 77 }, { x: 14, y: 103 }, { x: 100, y: 193 }]) {
    const initial = createWaxShell(center.x, radius, 42);
    const result = markAndBreak(initial, impact);
    const { pieces, chips } = result.shell;
    assert.equal(result.sound, "waxLarge");
    assert(pieces.length === 7 || pieces.length === 8);
    assert.equal(chips.length, 0);
    assert.equal(new Set(pieces.map((piece) => piece.id)).size, pieces.length);
    const area = pieces.reduce((sum, piece) => sum + piece.area, 0);
    assert(Math.abs(area - initial.intact.area) < .001);
    assert(pieces.every((piece) => piece.area > initial.intact.area * .03));
    assert(result.traces.length >= pieces.length);
    assert(result.traces.every(({ path, delay }) => path && delay >= 0));
    assert(containsWaxPiece(pieces[0], impact.x, impact.y));
    for (const dx of [-12, 0, 12]) for (const dy of [-12, 0, 12]) {
      const x = impact.x + dx, y = impact.y + dy;
      if (Math.hypot(x - center.x, y - center.y) < radius - 1) assert(containsWaxPiece(pieces[0], x, y));
    }
  }
});

test("seeded cracks repeat with the same seed and break at different seams across seeds", () => {
  const fractureWith = (seed) => markAndBreak(createWaxShell(center.x, radius, seed), center);
  assert.deepEqual(fractureWith(42), fractureWith(42));
  assert.notDeepEqual(fractureWith(42).traces, fractureWith(90001).traces);
});

test("the next break lifts a neighboring plate and splits off matching small crumbs", () => {
  const cracked = markAndBreak(createWaxShell(center.x, radius, 777), center).shell;
  const result = fractureWaxShell(cracked, center);
  const original = cracked.pieces.find((piece) => piece.id === result.loose.id);
  assert(result.shell.pieces.includes(cracked.pieces[0]));
  assert.deepEqual(result.shell.pieces, cracked.pieces.filter((piece) => piece !== original));
  assert.equal(result.crumbs.length, 2);
  assert(result.crumbs.every((crumb) => crumb.area > 0 && crumb.area / cracked.intact.area < .012));
  const removedArea = result.loose.area + result.crumbs.reduce((total, crumb) => total + crumb.area, 0);
  assert(Math.abs(removedArea - original.area) < 1e-8);
});

test("further holds remove every plate across different impact positions and seeds", () => {
  for (let seed = 0; seed < 20; seed++) {
    const angle = seed * .87;
    const reach = radius * (seed % 5) / 4;
    const impact = { x: 100 + Math.cos(angle) * reach, y: 100 + Math.sin(angle) * reach };
    let shell = markAndBreak(createWaxShell(center.x, radius, seed), impact).shell;
    for (let remaining = shell.pieces.length; remaining > 0; remaining--) {
      const point = waxKeyboardPoint(shell);
      const result = fractureWaxShell(shell, point);
      assert.equal(result.shell.pieces.length, remaining - 1);
      assert(result.loose.area > 0);
      shell = result.shell;
    }
    assert.equal(waxKeyboardPoint(shell), null);
    assert.equal(fractureWaxShell(shell, center), null);
  }
  const reset = createWaxShell(center.x, radius, 2);
  assert.deepEqual(reset.pieces, [reset.intact]);
  assert.equal(reset.preview, null);
  assert.equal(reset.chips.length, 0);
});
