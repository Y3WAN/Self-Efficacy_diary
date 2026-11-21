import test from "node:test";
import assert from "node:assert/strict";
import { createMallangMaterial, materialContact, membraneRadii, membraneRadiusAt, MATERIAL } from "../src/utils/mallangMaterial.js";
import { springDisplacement, updatePull } from "../src/utils/mallangMotion.js";
import { createWaxShell } from "../src/utils/waxShell.js";

const { radius, rimExpansion } = MATERIAL;
const pointAt = (angle, distance) => ({ x: 100 + Math.cos(angle) * distance, y: 100 + Math.sin(angle) * distance });

function run(material, from, to, step = 16) {
  for (let now = from + step; now <= to; now += step) material.advance(now);
}

test("a tap and a deep hold indent the top and expand only the matching edge", () => {
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const material = createMallangMaterial(), point = pointAt(angle, 68);
    material.touch(point.x, point.y, 0);
    material.advance(16);
    const earlyDent = material.sample(point.x, point.y);
    const earlyRim = membraneRadiusAt(membraneRadii(material), angle);
    assert(earlyDent < -0.2);
    assert(earlyRim > radius + 1);
    run(material, 16, 1200);
    const rim = membraneRadii(material);
    assert(material.sample(point.x, point.y) < earlyDent - 10);
    assert.equal(membraneRadiusAt(rim, angle), radius + rimExpansion);
    assert.equal(membraneRadiusAt(rim, angle + Math.PI), radius);
    for (const side of [-1, 1]) {
      let previous = radius + rimExpansion;
      for (let step = 1; step <= rim.length / 4; step++) {
        const next = membraneRadiusAt(rim, angle + side * step * Math.PI * 2 / rim.length);
        assert(next >= radius && next <= previous);
        assert(previous - next < 1.5, "the angular profile must taper without a sharp edge");
        previous = next;
      }
      assert.equal(previous, radius);
    }
  }
});

test("rubbing left to top carries depth and moves a single bulge with the finger", () => {
  const material = createMallangMaterial();
  material.touch(32, 100, 0);
  run(material, 0, 1200);
  for (let frame = 1; frame <= 24; frame++) {
    const angle = Math.PI + frame / 24 * Math.PI / 2;
    const point = pointAt(angle, 68), now = 1200 + frame * 16;
    material.move(point.x, point.y, now);
    material.advance(now);
    const rim = membraneRadii(material);
    assert.equal(material.contactDepth(), 1);
    assert(material.sample(point.x, point.y) < -10);
    assert(Math.max(...rim) - membraneRadiusAt(rim, angle) < .04);
    assert.equal(membraneRadiusAt(rim, angle + Math.PI), radius);
    assert.equal(material.state.nodes.filter(node => node.leftAt === null).length, 1);
    assert(material.state.nodes.length <= MATERIAL.maxTrail);
  }
  assert(material.state.nodes.some(node => node.leftAt !== null), "the departed path is still recovering");
  assert.equal(membraneRadiusAt(membraneRadii(material), Math.PI), radius);
  assert(material.sample(32, 100) > -1, "the previous contact must refill during rubbing");
});

test("crossing the center fades the outward displacement without releasing the dent", () => {
  const material = createMallangMaterial();
  material.touch(32, 100, 0); run(material, 0, 1200);
  let previous = membraneRadii(material);
  for (let step = 1; step <= 68; step++) {
    const x = 32 + step * 2, now = 1200 + step * 16;
    material.move(x, 100, now); material.advance(now);
    const rim = membraneRadii(material);
    assert.equal(material.contactDepth(), 1);
    assert(material.sample(x, 100) < -11);
    assert(Math.max(...rim.map((value, i) => Math.abs(value - previous[i]))) < 1);
    if (Math.abs(x - 100) <= MATERIAL.rimFadeStart) assert(rim.every(value => value === radius));
    else assert.equal(x < 100 ? rim[0] : rim[rim.length / 2], radius);
    previous = rim;
  }
});

test("rapid rubbing still updates the active load without painting a deep trench", () => {
  const material = createMallangMaterial();
  material.touch(100, 100, 0); run(material, 0, 1200);
  for (let frame = 1; frame <= 60; frame++) {
    const point = pointAt(frame * .09, 88), now = 1200 + frame * 16;
    material.move(point.x, point.y, now); material.advance(now);
    assert.equal(material.contactDepth(), 1);
    assert.equal(material.state.nodes.filter(node => node.leftAt === null).length, 1);
    assert(material.state.nodes.length <= MATERIAL.maxTrail);
    assert(material.state.nodes.slice(0, -1).every(node => node.depth < .4));
    assert(Math.abs(material.state.signedHeight) < .05);
  }
  material.release(2160, false); run(material, 2160, 4500);
  assert.equal(material.state.active, false);
});

test("the small tip emerges before the inflated edge without pulling the body prematurely", () => {
  const material = createMallangMaterial();
  const motion = { mode: "grab", rect: { left: 0, top: 0, width: 800, height: 600 }, bodySize: 200,
    position: { x: 50, y: 50 }, pointer: { x: 490, y: 300 } };
  material.touch(190, 100, 0); run(material, 0, 1200);
  let now = 1200, previous = membraneRadii(material), lastContact = { x: 190, y: 100 };
  let previousReach = 0, previousBlend = 0;
  for (const direction of [1, -1]) {
    for (let step = 0; step <= 120; step++) {
      const distance = direction === 1 ? 90 + step / 4 : 120 - step / 4;
      const raw = { x: 100 + distance, y: 100 };
      motion.pointer.x = 400 + distance;
      const contact = materialContact(material, raw);
      now += 16; material.move(contact.x, contact.y, now); material.advance(now);
      updatePull(motion, materialContact(material, raw).radius);
      const radii = membraneRadii(material, motion.pull);
      assert(Math.abs(contact.x - lastContact.x) < 2);
      assert(Math.max(...radii.map((r, index) => Math.abs(r - previous[index]))) < 3);
      if (direction === 1 && distance <= radius + rimExpansion) {
        if (distance <= 96) assert.equal(motion.pull, null);
        if (distance >= 105) {
          assert(motion.pull?.radius > 0, "the small circle is already visible inside the swollen rim");
          assert(radii[0] > radius + rimExpansion);
        }
        assert.deepEqual(springDisplacement({ ...motion, pullStartRadius: contact.radius }, 400, 300), { x: 0, y: 0 });
        assert.equal(contact.x, raw.x);
      }
      if (motion.pull) {
        assert.equal(motion.pull.x, raw.x, "the emerging tip keeps tracking the hand");
        const reach = motion.pull.x - 100;
        const blend = motion.pull.blend;
        if (direction === 1 && previousReach) {
          assert(reach >= previousReach && reach - previousReach <= .4);
          assert(blend >= previousBlend && blend - previousBlend <= .03);
        }
        previousReach = reach;
        previousBlend = blend;
      }
      if (distance >= 120) {
        assert.equal(motion.pull.x, raw.x, "the fully formed tip reaches its original position");
        assert.equal(motion.pull.blend, 1);
        assert(material.sample(contact.x, contact.y) < -10);
      }
      assert.equal(material.contactDepth(), 1);
      previous = radii; lastContact = contact;
    }
  }
  assert.equal(motion.pull, null);
  assert.equal(material.contactDepth(), 1);
  material.release(now); run(material, now, now + 6000);
  assert.equal(material.state.active, false);
  assert(material.state.height.every(height => height === 0));
  assert(membraneRadii(material).every(value => value === radius));
});

test("shell support keeps its local dwell response during a slow rim stroke", () => {
  const material = createMallangMaterial(); material.setShell(createWaxShell(100, 94, 123));
  material.touch(100, 100, 0); run(material, 0, 1200);
  for (let frame = 1; frame <= 225; frame++) {
    const now = 1200 + frame * 16;
    material.move(100 + frame * 0.4, 100, now); material.advance(now);
  }
  assert(material.contactDepth() < 0.9, "a covered shell must not inherit sustained rim pressure");
  assert(Math.abs(material.state.signedHeight) < 0.05);
  material.release(4800); run(material, 4800, 11000);
  assert.equal(material.state.active, false);
});
