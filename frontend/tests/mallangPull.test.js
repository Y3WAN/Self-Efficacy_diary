import test from "node:test";
import assert from "node:assert/strict";
import { blendPullTip, pullStretchProgress, tetherSpringDisplacement } from "../src/utils/mallangPull.js";
import { advanceMotion, beginPull, followTether, pulledCircle, pullTarget } from "../src/utils/mallangMotion.js";

function motionAt(now = 0, hasMoved = false) {
  return { mode: "grab", rect: { left: 0, top: 0, width: 800, height: 600 }, bodySize: 200,
    position: { x: 50, y: 50 }, pointer: { x: 400, y: 300 }, target: null,
    tetherPoint: null, pull: null, vx: 0, vy: 0, lastFrame: now, reducedMotion: false, hasMoved };
}

test("the visible tip stays under the pointer on the very first frame", () => {
  const motion = motionAt();
  motion.pointer = { x: 528, y: 300 };
  beginPull(motion);
  assert.equal(motion.pull.x, 228);
  assert.equal(motion.pull.y, 100);
  assert.equal(motion.pull.radius, 38);
  assert.equal(motion.pull.blend, 1);
  assert.deepEqual(pulledCircle(motion), blendPullTip(pullTarget(motion), 1));
});

test("the real frame integration responds equally on a first grab, held grab and regrab", () => {
  const first = motionAt(0, false);
  const held = motionAt(1000, true);
  const regrab = motionAt(5000, false);
  for (const motion of [first, held, regrab]) {
    const start = motion.lastFrame;
    beginPull(motion);
    motion.pointer = { x: 528, y: 300 };
    followTether(motion);
    advanceMotion(motion, start + 16);
    assert(motion.position.x * 8 - 400 > 3, "the body must respond within the first frame");
    assert(motion.vx > 0);
  }
  assert.deepEqual(first.position, held.position);
  assert.deepEqual(first.position, regrab.position);
  assert.equal(first.vx, held.vx);
  assert.equal(first.vx, regrab.vx);
});

test("a first pull just past the taut distance has no extra rim activation delay", () => {
  for (const hasMoved of [false, true]) {
    const motion = motionAt(0, hasMoved);
    beginPull(motion);
    motion.pointer = { x: 510, y: 300 };
    followTether(motion);
    advanceMotion(motion, 16);
    assert(motion.position.x > 50);
  }
});

test("tip growth depends continuously on stretch rather than time since a click", () => {
  let previousRadius = 0;
  for (let distance = 94; distance <= 104; distance += 0.25) {
    const target = { x: 100 + distance, y: 100, radius: 38 };
    const progress = pullStretchProgress(target);
    const tip = blendPullTip(target, progress);
    assert.equal(tip.x, target.x);
    assert.equal(tip.y, target.y);
    assert(tip.radius >= previousRadius && tip.radius - previousRadius < 1.5);
    previousRadius = tip.radius;
  }
  assert.equal(pullStretchProgress({ x: 194, y: 100 }), 0);
  assert.equal(pullStretchProgress({ x: 204, y: 100 }), 1);
  assert.equal(pullStretchProgress({ x: 228, y: 100 }), 1);
  assert.deepEqual(blendPullTip({ x: 100, y: 100, radius: 38 }, 0), { x: 100, y: 100, radius: 0, blend: 0 });
});

test("gentle slow pulls keep the small tip visible while the body follows", () => {
  for (const bodySize of [80, 200, 300]) {
    for (const normalizedSpeed of [0.6, 1.2, 2]) {
      const motion = motionAt();
      motion.rect.width = 1200;
      motion.position.x = 25;
      motion.pointer.x = 300;
      motion.bodySize = bodySize;
      beginPull(motion);
      for (let frame = 1; frame <= 240; frame++) {
        motion.pointer.x = 300 + frame * normalizedSpeed * bodySize / 200;
        advanceMotion(motion, frame * 16);
      }
      const target = pullTarget(motion);
      const stretch = Math.hypot(target.x - 100, target.y - 100);
      assert(stretch < 112, "this case must exercise gentle stretching, not a hard pull");
      assert(motion.vx > 0);
      const tip = pulledCircle(motion);
      assert(tip, `tip missing at body size ${bodySize} and speed ${normalizedSpeed}`);
      assert(tip.radius > 30, "ordinary dragging must show a usable small tip");
    }
  }
});

test("actual frames preserve slack, wall constraints, coasting and low-frame stability", () => {
  const slack = motionAt();
  slack.pointer.x += 70;
  beginPull(slack);
  advanceMotion(slack, 16);
  assert.deepEqual(slack.position, { x: 50, y: 50 });
  assert.equal(pulledCircle(slack), null);

  const wall = motionAt();
  wall.position.x = 100;
  wall.pointer = { x: 950, y: 380 };
  wall.vx = 0.8;
  beginPull(wall);
  advanceMotion(wall, 500);
  assert(wall.position.x <= 100 && wall.position.y <= 100);
  assert(Number.isFinite(wall.vx) && Number.isFinite(wall.position.y));

  const coast = motionAt();
  coast.mode = "coast";
  coast.vx = 0.5;
  advanceMotion(coast, 16);
  assert(coast.position.x > 50 && coast.vx > 0 && coast.vx < 0.5);
  assert.deepEqual(tetherSpringDisplacement({ x: 0, y: 0 }, 104, { x: 200, y: 200 },
    { width: 500, height: 500 }), { x: 0, y: 0 });
});
