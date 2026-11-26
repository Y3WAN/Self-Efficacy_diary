import test from "node:test";
import assert from "node:assert/strict";
import { blendPullTip, pullStretchProgress, tetherSpringDisplacement } from "../src/utils/mallangPull.js";
import { advanceAngularCoast, advanceMotion, beginPull, dragRotationDelta, MAX_TIP_EXTENSION, MAX_VISUAL_TETHER_DISTANCE,
  PULL_RADIUS, pulledCircle, pullTarget, releaseAngularSpeed, springDisplacement, updatePull } from "../src/utils/mallangMotion.js";

function motionAt(now = 0, hasMoved = false) {
  return { mode: "grab", rect: { left: 0, top: 0, width: 800, height: 600 }, bodySize: 200,
    position: { x: 50, y: 50 }, pointer: { x: 400, y: 300 }, target: null,
    tetherPoint: null, pull: null, vx: 0, vy: 0, lastFrame: now, reducedMotion: false, hasMoved };
}

test("the visible tip stays under the pointer on the very first frame", () => {
  const motion = motionAt();
  motion.pointer = { x: 512, y: 300 };
  beginPull(motion);
  assert.equal(motion.pull.x, 212);
  assert.equal(motion.pull.y, 100);
  assert.equal(motion.pull.radius, PULL_RADIUS);
  assert.equal(motion.pull.blend, 1);
  assert.deepEqual(pulledCircle(motion), { ...blendPullTip(pullTarget(motion), 1), edgeRadius: 94 });
});

test("the real frame integration responds equally on a first grab, held grab and regrab", () => {
  const first = motionAt(0, false);
  const held = motionAt(1000, true);
  const regrab = motionAt(5000, false);
  for (const motion of [first, held, regrab]) {
    const start = motion.lastFrame;
    beginPull(motion);
    motion.pointer = { x: 528, y: 300 };
    for (let time = 16; time <= 64; time += 16) advanceMotion(motion, start + time);
    assert(motion.position.x * 8 + pullTarget(motion).x - 100 > 522, "the tip catches up before the body");
    const movement = motion.position.x * 8 - 400;
    assert(movement > 1 && movement < 10, "the body moves gradually once the tether is taut");
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
    for (let time = 16; time <= 80; time += 16) advanceMotion(motion, time);
    assert(motion.position.x > 50);
  }
});

test("the pull force engages gradually outside both a resting and a swollen rim", () => {
  const motion = motionAt();
  for (const [rim, onset] of [[94, 100], [108, 108]]) {
    motion.pullStartRadius = rim;
    const forceAt = (extension) => {
      motion.pointer.x = 400 + onset + extension;
      return springDisplacement(motion, 400, 300).x;
    };
    assert.equal(forceAt(0), 0);
    assert(forceAt(0.5) > 0 && forceAt(0.5) < forceAt(1) / 3);
    assert(forceAt(4) < forceAt(8));
    assert(Math.abs((forceAt(8) - forceAt(7.99)) - (forceAt(8.01) - forceAt(8))) < 0.00001);
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

test("release and regrab carry the displayed tip and both velocities through the transition", () => {
  const motion = motionAt();
  motion.pointer.x = 550;
  beginPull(motion);
  advanceMotion(motion, 32);
  updatePull(motion);
  const beforeRelease = motion.pull;
  const bodySpeed = motion.vx;
  motion.mode = "coast";
  advanceMotion(motion, 32);
  updatePull(motion);
  assert(Math.hypot(motion.pull.x - beforeRelease.x, motion.pull.y - beforeRelease.y) < 1e-6);
  assert.equal(motion.pull.radius, beforeRelease.radius);
  assert.equal(motion.vx, bodySpeed);
  advanceMotion(motion, 72);
  updatePull(motion);
  assert(motion.pull.x < beforeRelease.x);
  assert(motion.vx > 0 && motion.vx < bodySpeed);

  const returning = motion.pull;
  const returningWorldX = motion.position.x * 8 + returning.x - 100;
  const returningSpeed = motion.tetherSpeed.x;
  motion.mode = "grab";
  motion.pointer.x = 550;
  beginPull(motion);
  advanceMotion(motion, 72);
  updatePull(motion);
  assert(Math.hypot(motion.pull.x - returning.x, motion.pull.y - returning.y) < 1e-6);
  assert.equal(motion.pull.radius, returning.radius);
  assert.equal(motion.tetherSpeed.x, returningSpeed);
  advanceMotion(motion, 120);
  updatePull(motion);
  assert(motion.position.x * 8 + motion.pull.x - 100 > returningWorldX);

  motion.mode = "coast";
  for (let time = 128; time <= 800; time += 8) advanceMotion(motion, time);
  updatePull(motion);
  assert.equal(motion.pull, null);
});

test("the tether keeps following after body tension caps while the visible tip stays near the rim", () => {
  const taut = motionAt();
  const extended = motionAt();
  taut.pointer.x = 528;
  extended.pointer.x = 900;
  beginPull(taut);
  beginPull(extended);
  assert(extended.pull.x > taut.pull.x);
  assert.equal(pullTarget(extended).x - 100, MAX_VISUAL_TETHER_DISTANCE);
  assert(extended.pull.x - 100 - extended.pull.edgeRadius <= MAX_TIP_EXTENSION);
  const narrowSide = pulledCircle(extended, 62);
  assert.equal(narrowSide.x - 100, 62 + MAX_TIP_EXTENSION);
  assert.deepEqual(springDisplacement(extended, 400, 300), springDisplacement(taut, 400, 300));
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
      assert(stretch < 121, "this case must exercise gentle stretching, not a hard pull");
      assert(motion.vx > 0);
      const tip = pulledCircle(motion);
      assert(tip, `tip missing at body size ${bodySize} and speed ${normalizedSpeed}`);
      assert(tip.radius >= PULL_RADIUS * .8, "ordinary dragging must show a usable small tip");
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
  assert.deepEqual(tetherSpringDisplacement({ x: 0, y: 0 }, 104, 8, { x: 200, y: 200 },
    { width: 500, height: 500 }), { x: 0, y: 0 });
});

test("held force reads the current pointer on each substep at 12.5, 31 and 62 fps", () => {
  const outcomes=[];
  for(const step of [16,32,80]) {
    const motion=motionAt();motion.rect.width=4000;motion.position.x=25;
    motion.pointer.x=1800;beginPull(motion);
    for(let time=step;time<=960;time+=step)advanceMotion(motion,time);
    outcomes.push(motion);
  }
  for(const motion of outcomes.slice(1)) {
    assert(Math.abs(motion.vx-outcomes[0].vx)<.00001);
    assert(Math.abs(motion.position.x-outcomes[0].position.x)<.00001);
  }
});

test("a tangential drag turns the body more at the rim and reverses with the pointer", () => {
  const center = { x: 100, y: 100 }, radius = 94;
  const from = (x) => ({ x, y: center.y });
  const to = (x) => ({ x, y: center.y + 25 });
  const nearCenter = dragRotationDelta(from(110), to(110), center, radius);
  const midBody = dragRotationDelta(from(150), to(150), center, radius);
  const rim = dragRotationDelta(from(190), to(190), center, radius);
  assert(nearCenter > 0 && midBody > nearCenter && rim > midBody);
  assert(Math.abs(rim + dragRotationDelta(to(190), from(190), center, radius)) < 1e-12);
  assert.equal(dragRotationDelta(from(190), from(240), center, radius), 0);
  assert.equal(dragRotationDelta(from(30), from(170), center, radius), 0);
  assert.equal(dragRotationDelta(from(190), from(190), center, radius), 0);
});

test("a fresh spin keeps turning past 200 ms in either direction and a held pause cancels the spin", () => {
  const speed = releaseAngularSpeed(.05, 0);
  assert(speed > releaseAngularSpeed(.05, 80));
  assert.equal(releaseAngularSpeed(.05, 320), 0);
  assert(advanceAngularCoast(releaseAngularSpeed(.003, 60), 200).speed > 0,
    "a slower drag followed by a short release delay still carries through");
  assert.equal(releaseAngularSpeed(0, 0), 0);

  const early = advanceAngularCoast(speed, 200);
  assert(early.delta > 0 && early.speed < speed);
  const settled = advanceAngularCoast(speed, 560);
  assert.equal(settled.speed, 0);
  assert(settled.delta > .55 && settled.delta < .77, "a fast flick adds about one ninth of a turn");
  const reversed = advanceAngularCoast(-speed, 560);
  assert.equal(reversed.delta, -settled.delta);
  const remaining = advanceAngularCoast(early.speed, 360);
  assert(remaining.delta > .13, "there is still a visible turn after the first 200 ms");
  assert(Math.abs(early.delta + remaining.delta - settled.delta) < 1e-12);
});
