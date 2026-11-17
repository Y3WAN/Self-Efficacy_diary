import test from "node:test";
import assert from "node:assert/strict";
import { createWaxShell, fractureWaxShell, waxKeyboardPoint } from "../src/utils/waxShell.js";

test("wax starts intact and ignores contacts outside the shell", () => {
  const shell = createWaxShell(100, 94);
  assert.equal(shell.pieces.length, 1); assert.equal(shell.fractures, 0);
  assert(shell.wholeArea > 27000);
  assert.equal(fractureWaxShell(shell, { x: -500, y: -500 }, 45), null);
});

test("fractures preserve area and do not mutate the old shell", () => {
  const shell = createWaxShell(100, 94);
  const result = fractureWaxShell(shell, { x: 100, y: 100 }, 45.12, shell.nextPieceId);
  assert.equal(shell.pieces.length, 1); assert.equal(shell.fractures, 0);
  assert(result.shell.pieces.length > 1);
  const area = result.shell.pieces.reduce((sum, piece) => sum + piece.area, 0);
  assert(Math.abs(area - shell.wholeArea) < shell.wholeArea * 0.001);
  assert.equal(new Set(result.shell.pieces.map((piece) => piece.id)).size, result.shell.pieces.length);
  assert.equal(result.sound, "waxLarge");
});

test("dragging one hold cannot immediately refracture its newly created fragments", () => {
  const initial = createWaxShell(100, 94);
  const limit = initial.nextPieceId;
  const first = fractureWaxShell(initial, { x: 100, y: 100 }, 45.12, limit).shell;
  const fragments = first.pieces.filter((piece) => piece.id >= limit);
  const second = fractureWaxShell(first, { x: 125, y: 100 }, 45.12, limit).shell;
  for (const fragment of fragments) assert.equal(second.pieces.find((piece) => piece.id === fragment.id), fragment);
});

test("repeated keyboard-targeted holds remove the entire shell without stalled slivers", () => {
  let shell = createWaxShell(100, 94), presses = 0;
  while (shell.pieces.length && presses < 100) {
    const point = waxKeyboardPoint(shell);
    assert(point && Number.isFinite(point.x) && Number.isFinite(point.y));
    const result = fractureWaxShell(shell, point, 45.12, shell.nextPieceId);
    assert(result, "a visible remaining region must be reachable");
    shell = { ...result.shell, chips: [] };
    for (const piece of shell.pieces) assert(piece.area > 0 && Number.isFinite(piece.area));
    presses++;
  }
  assert.equal(shell.pieces.length, 0);
  assert.equal(waxKeyboardPoint(shell), null);
  assert(presses < 100);
  assert.equal(fractureWaxShell(shell, { x: 100, y: 100 }, 45), null);
  const reset = createWaxShell(100, 94);
  assert.equal(reset.pieces.length, 1); assert.equal(reset.chips.length, 0);
});
