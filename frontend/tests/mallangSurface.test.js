import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bareSurfaceContact, createMallangMaterial, membranePath, membraneRadii, membraneRadiusAt, MATERIAL } from "../src/utils/mallangMaterial.js";
import { createWaxShell, fractureWaxShell } from "../src/utils/waxShell.js";
import { createMallangSurface } from "../src/utils/mallangSurface.js";
import { advanceMotion, beginPull, MAX_VISUAL_TETHER_DISTANCE, PULL_RADIUS, pulledCircle, updatePull } from "../src/utils/mallangMotion.js";

function run(m, from, to, step = 16) {
  for (let time = from + step; time <= to; time += step) m.advance(time);
}
test("local depression and raised reservoir share a bounded signed height integral", () => {
  for (const p of [{x:100,y:100},{x:190,y:100},{x:38,y:47}]) {
    const m=createMallangMaterial(); m.touch(p.x,p.y,0); run(m,0,1600);
    assert(m.sample(p.x,p.y) < -4);
    assert(Math.max(...m.state.height) > 0.6);
    assert(Math.abs(m.state.signedHeight) < .02);
    assert(Math.abs(m.state.displaced-m.state.raised) < .02);
    const down=m.state.displaced, height=Float32Array.from(m.state.height);
    run(m,1600,12000);
    assert(Math.abs(m.state.displaced-down) < 5, "stationary pressure must stop accumulating");
    assert(Math.max(...m.state.height) < 16);
    assert(Math.min(...height) > -15.5);
    assert.equal(m.state.nodes.length,1);
    assert.equal(m.state.active,false, "a steady held contact must become idle");
    m.release(12000); run(m,12000,18000);
    assert.equal(m.state.active,false); assert.equal(m.state.nodes.length,0);
    assert.equal(m.state.waves.length,0); assert.equal(m.sample(100,100),0);
  }
});
test("release refills the previous dent and a regrab continues from its current shape", () => {
  const material = createMallangMaterial(), x = 32, y = 100;
  material.touch(x, y, 0); run(material, 0, 1200);
  const held = material.sample(x, y);
  material.release(1200, false); run(material, 1200, 1456);
  const recovering = material.sample(x, y), rim = membraneRadii(material);
  assert(recovering > held && recovering < 0);
  assert(rim[48] > MATERIAL.radius && rim[48] < MATERIAL.radius + MATERIAL.rimExpansion);
  material.touch(x, y, 1456);
  assert.equal(material.sample(x, y), recovering);
  assert.deepEqual(membraneRadii(material), rim);
  assert(material.contactDepth() > .5);
  material.advance(1472);
  assert(Math.abs(material.sample(x, y) - recovering) < 2);
  material.release(1472, false); run(material, 1472, 4000);
  assert.equal(material.state.active, false);
  assert.equal(material.sample(x, y), 0);
  assert(membraneRadii(material).every(value => value === MATERIAL.radius));
});
test("reversals, circles and long pointer jumps remain finite and settle", () => {
  const m=createMallangMaterial(); m.touch(100,100,0);
  for(let frame=1;frame<=250;frame++) {
    const now=frame*16, a=frame*.27, dir=frame%40<20?1:-1;
    m.move(100+Math.cos(a)*48*dir,100+Math.sin(a)*44,now);
    m.advance(now);
    assert(m.state.nodes.length<=MATERIAL.maxTrail);
    assert(Math.abs(m.state.signedHeight)<.05);
    assert(m.state.height.every(Number.isFinite));
    assert(Math.max(...m.state.height)<17);
  }
  m.move(10000,-10000,4016);m.advance(4016);
  assert.equal(m.state.contact.x,10000);
  assert(m.state.nodes.length<=MATERIAL.maxTrail);
  m.release(4016);run(m,4016,10000);
  assert.equal(m.state.active,false);assert.equal(m.state.waves.length,0);
});
test("multiple waves coexist, keep independent parameters and have a finite lifetime", () => {
  const m=createMallangMaterial();
  m.wave(25,100,.8,0,0);m.advance(300);m.wave(160,100,.7,300,0);
  assert.equal(m.state.waves.length,2);
  assert.equal(MATERIAL.waveWidth,94*.19*1.1);
  assert.equal(MATERIAL.waveSpeed,75.2);
  for(let i=0;i<100;i++)m.wave(100,100,.5,320,0);
  assert.equal(m.state.waves.length,MATERIAL.maxWaves);
  run(m,300,7500);
  assert.equal(m.state.waves.length,0);assert.equal(m.state.active,false);
});
test("shell support and removed support alter the same deforming contents", () => {
  const shell=createWaxShell(100,94,123), soft=createMallangMaterial(), wax=createMallangMaterial();
  wax.setShell(shell);
  for(const m of [soft,wax]) {m.touch(100,100,0);run(m,0,1600);}
  const supported=wax.sample(100,100);
  assert(Math.abs(supported)<Math.abs(soft.sample(100,100))*.5);
  let broken=shell;
  for(let i=0;i<6;i++)broken=fractureWaxShell(broken,{x:100,y:100},45,broken.nextPieceId)?.shell??broken;
  wax.setShell(broken);run(wax,1600,3200);
  assert(wax.sample(100,100)<supported-1,"removing a shell must release its constraint");
  assert(Math.abs(wax.state.signedHeight)<.05);
});
test("one continuous contour contains the tip and remains finite through absorption", () => {
  const m=createMallangMaterial();m.touch(190,100,0);run(m,0,1500);
  const bodyRadius=membraneRadii(m)[0];
  const motion = { rect: { left: 0, top: 0, width: 800, height: 600 }, bodySize: 200,
    position: { x: 50, y: 50 }, pointer: { x: 400, y: 300 } };
  let previous=null;
  for(let d=bodyRadius;d<=128;d+=.25) {
    motion.pointer.x = 400 + d;
    const pull = pulledCircle(motion, bodyRadius);
    const radii=membraneRadii(m,pull);
    if (pull) {
      assert(radii[0] >= pull.x - 100 - .001);
      if (d - bodyRadius >= MATERIAL.pullCrownDistance) {
        assert(radii[0] >= d + pull.radius * MATERIAL.pullCrownRatio - .2);
      }
      if (d - bodyRadius <= 5) assert(radii[0] - bodyRadius < 11);
    }
    assert(radii.every(Number.isFinite));
    if(previous)assert(Math.max(...radii.map((x,i)=>Math.abs(x-previous[i])))<3);
    assert(!/NaN|Infinity/.test(membranePath(radii)));previous=radii;
  }
  const peak = previous[0];
  assert(peak > MATERIAL.radius * 1.44 && peak < MATERIAL.radius * 1.53);
  const contour = Array.from(previous, (radius, index) => {
    const angle = index / previous.length * Math.PI * 2;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  for (let i = 0; i < contour.length; i++) {
    const a = contour.at(i - 1), b = contour[i], c = contour[(i + 1) % contour.length];
    assert((b.x - a.x) * (c.y - b.y) > (b.y - a.y) * (c.x - b.x),
      "the fully pulled shoulders must stay convex");
  }
  assert.equal(previous[previous.length / 2], MATERIAL.radius);
  motion.mode = "grab";
  motion.pointer.x = 528;
  motion.lastFrame = 0;
  motion.vx = motion.vy = 0;
  beginPull(motion, bodyRadius);
  motion.mode = "coast";
  for (let time = 3; time <= 300; time += 3) {
    advanceMotion(motion, time);
    updatePull(motion, bodyRadius);
    const radii = membraneRadii(m, motion.pull);
    assert(Math.max(...radii.map((x, i) => Math.abs(x - previous[i]))) < 4);
    previous = radii;
  }
  assert.equal(motion.pull, null);
});
test("low frame rates, cancellation and reduced motion preserve bounded material feedback", () => {
  for(const step of [8,16,33,80,500]) {
    const m=createMallangMaterial();m.state.reducedMotion=true;m.touch(100,100,0);
    run(m,0,4000,step);
    assert(m.sample(100,100)<-10);
    m.release(4000);assert.equal(m.state.waves.length,0);
    run(m,4000,16000,step);assert.equal(m.state.active,false);
    m.reset(16000);assert.equal(m.state.nodes.length,0);assert.equal(m.state.energy,0);
  }
});

test("contact time uses wall time even when a physics frame must be clamped", () => {
  const m=createMallangMaterial();m.touch(100,100,0);m.advance(800);
  assert.equal(m.contactDepth(),1);
  assert(m.state.height.every(Number.isFinite));
});

test("body pressure and impact stay inside the reserved wall margin while the tip is free", () => {
  const m=createMallangMaterial();m.touch(190,100,0);run(m,0,1600);
  const rim=membraneRadii(m);
  assert.equal(rim[0], MATERIAL.radius + MATERIAL.rimExpansion);
  assert.equal(rim[rim.length / 2], MATERIAL.radius);
  const margin = MATERIAL.radius + MATERIAL.rimExpansion + 3;
  const body=membraneRadii(m,null,{x:.9,y:.5});
  assert(body.every(r=>r<=margin));
  const pulled=membraneRadii(m,{x:228,y:100,radius:38});
  assert(pulled[0]>margin,"the pulled end may cross the body's wall margin");
});
test("restored relief keeps the current outline, tip tracking and palette while its wider trail refills", (t) => {
  const originalDocument=globalThis.document,originalWindow=globalThis.window,originalPath=globalThis.Path2D;
  const calls={pixels:0,clips:0,encodes:0};
  const context={createImageData:(w,h)=>{calls.pixels++;return {width:w,data:new Uint8ClampedArray(w*h*4)};},
    putImageData(pixels) { calls.lastPixels = pixels; },setTransform(){},clearRect(){},save(){},restore(){},clip(){calls.clips++;},
    fillRect(){},drawImage(){},stroke(){},beginPath(){},moveTo(){},lineTo(){},ellipse(){},fill(){},
    createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})};
  globalThis.document={createElement:()=>({getContext:()=>context,toDataURL(){calls.encodes++;throw Error("PNG encoding");}})};
  globalThis.window={devicePixelRatio:2};globalThis.Path2D=class {constructor(path){this.path=path;}};
  t.after(()=>{globalThis.document=originalDocument;globalThis.window=originalWindow;globalThis.Path2D=originalPath;});
  const m=createMallangMaterial(),canvas={getContext:()=>context},overlay={getContext:()=>context};
  const renderer=createMallangSurface(canvas,m,overlay);
  function green(x, y) {
    const { data, width } = calls.lastPixels;
    const step = 400 / (width - 1);
    const col = (x + 100) / step, row = (y + 100) / step;
    const left = Math.floor(col), top = Math.floor(row);
    const weightX = col - left, weightY = row - top;
    const pixel = (cx, cy) => data[(cy * width + cx) * 4 + 1];
    return (pixel(left, top) * (1 - weightX) + pixel(left + 1, top) * weightX) * (1 - weightY) +
      (pixel(left, top + 1) * (1 - weightX) + pixel(left + 1, top + 1) * weightX) * weightY;
  }

  for (const [dx, dy] of [[-1, 0], [0, -1], [0, 1], [-1, -1]]) {
    m.reset(); renderer.draw();
    const distance = dx && dy ? 40 : 48;
    const x = 100 + dx * distance, y = 100 + dy * distance;
    const directionLength = Math.hypot(dx, dy);
    const sideX = -dy / directionLength * 68, sideY = dx / directionLength * 68;
    const outer = [x + sideX, y + sideY], inner = [x - sideX, y - sideY];
    const restDent = green(x, y), restInner = green(...inner), restOuter = green(...outer);
    m.touch(x, y, 0); m.advance(16); renderer.draw();
    assert(green(x, y) < restDent - 5, "even the first pressure frame has a visible dent");
    run(m, 16, 1200); renderer.draw();
    assert(green(x, y) < restDent - 30);
    assert.equal(green(...outer), restOuter, "the body color stays fixed beyond the restored relief");
    assert.equal(green(...inner), restInner);
  }

  const fullDentRadius = 28;
  renderer.setFlatStyle(true);
  for (const angle of [-Math.PI / 2, 0, Math.PI / 4, Math.PI, Math.PI / 2]) {
    const pointAt = (distance) => ({ x: 100 + Math.cos(angle) * distance, y: 100 + Math.sin(angle) * distance });
    const frames = [];
    for (const distance of [48, 116, 148, 155, 163, MAX_VISUAL_TETHER_DISTANCE, 195]) {
      const tip = pointAt(distance);
      const contact = bareSurfaceContact(tip);
      m.reset(); renderer.resetTrail(); m.touch(contact.x, contact.y, 0); run(m, 0, 1200);
      const pull = distance > 108 ? { ...pointAt(Math.min(distance, MAX_VISUAL_TETHER_DISTANCE)), radius: PULL_RADIUS, edgeRadius: 108, blend: 1 } : null;
      const outline = renderer.draw(pull);
      renderer.resetTrail();
      const pose = pull && { ...pull, ...tip };
      assert.equal(renderer.draw(pull, null, pose), outline, "moving the dent must not change the outline");
      const scanStart = distance === 48 ? 25 : Math.min(distance, MAX_VISUAL_TETHER_DISTANCE) - 70;
      const outlineRadius = membraneRadiusAt(membraneRadii(m, pull), angle);
      const samples = Array.from({ length: Math.floor(outlineRadius) - scanStart }, (_, i) => {
        const { x, y } = pointAt(scanStart + i);
        return green(x, y);
      });
      const shadow = Math.min(...samples);
      assert(shadow < 175, "the dent shadow is visible");
      assert(samples.every(value => value <= 207), "the bare shader never adds a bright band");
      const floor = samples.flatMap((value, index) => value <= shadow + 1 ? [scanStart + index] : []);
      const dent = (floor[0] + floor.at(-1)) / 2;
      if (pull) assert(dent + fullDentRadius <= outlineRadius + 1, "the dent stays on the visible surface");
      frames.push({ dent, samples });
    }

    const cap = frames.at(-2);
    assert(Math.abs(cap.dent - 136) <= 1, "the maximum reaches the marked point");
    assert.deepEqual(frames.at(-1), cap, "the dent stays in place past full pull");
    assert(frames[1].dent > frames[0].dent, "the dent follows the pull once there is room");
    assert(frames[3].dent > frames[2].dent);
    assert(cap.dent - frames[4].dent <= 2, "the dent eases to a stop at full stretch");
  }
  renderer.setFlatStyle(false);
  m.reset(); renderer.resetTrail(); renderer.draw();
  const restTrail = green(68, 74);
  const restBesideTrail = green(68, 140);
  m.touch(62, 74, 0);
  run(m, 0, 1200);
  renderer.draw();
  m.move(119, 74, 1216);
  run(m, 1200, 1264);
  renderer.draw();
  assert(green(68, 74) < restTrail - 20, "the previous depression remains visible along the old path");
  assert.equal(green(68, 140), restBesideTrail, "untouched material beyond the wider trail keeps its color");
  run(m, 1264, 2450);
  renderer.draw();
  assert.equal(green(68, 74), restTrail, "the trail fades completely while the new press stays held");

  m.reset(); renderer.resetTrail();
  m.touch(100, 26, 0); run(m, 0, 1200);
  const tip = { x: 100, y: 100 - MAX_VISUAL_TETHER_DISTANCE, radius: PULL_RADIUS, edgeRadius: 108, blend: 1 };
  renderer.draw(tip, null, tip);
  const trailingPoint = [60, -36];
  const untouched = green(...trailingPoint);
  m.advance(1216);
  renderer.draw(tip, null, tip, { x: 40, y: 0 });
  assert(green(...trailingPoint) < untouched - 4, "the visible dent leaves a trail when the fully stretched body moves");
  assert(renderer.trailActive);
  run(m, 1216, 2100);
  renderer.draw(tip, null, tip, { x: 40, y: 0 });
  assert.equal(green(...trailingPoint), untouched);
  assert(!renderer.trailActive);

  assert.equal(calls.pixels,2);assert.equal(calls.encodes,0);assert(calls.clips>=15);
  assert.equal(canvas.width,overlay.width);
});
test("measured material workload has bounded memory under a prolonged input", (t) => {
  const m=createMallangMaterial();m.touch(100,100,0);const started=performance.now();
  const height=m.state.height,velocity=m.state.velocity;
  for(let i=1;i<=360;i++){m.move(100+Math.sin(i*.04)*50,100+Math.cos(i*.06)*50,i*16);m.advance(i*16);}
  t.diagnostic("360 material frames: "+(performance.now()-started).toFixed(1)+" ms");
  assert.equal(m.state.height,height);assert.equal(m.state.velocity,velocity);
  assert(m.state.nodes.length<=72);assert(m.state.waves.length<=12);
});

test("the bare renderer displays expanding ripples without changing its silhouette and respects reduced motion", (t) => {
  const previous = { document: globalThis.document, window: globalThis.window, Path2D: globalThis.Path2D };
  let pixels, clips = 0;
  const context = { createImageData: (w, h) => ({ width: w, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(value) { pixels = value; }, setTransform() {}, clearRect() {}, save() {}, restore() {},
    clip() { clips++; }, fillRect() {}, drawImage() {}, stroke() {}, fill() {},
    createRadialGradient: () => ({ addColorStop() {} }) };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  globalThis.window = { devicePixelRatio: 1 }; globalThis.Path2D = class {};
  t.after(() => { Object.assign(globalThis, previous); });
  const material = createMallangMaterial(), renderer = createMallangSurface({ getContext: () => context }, material);
  const outline = renderer.draw(), resting = Uint8ClampedArray.from(pixels.data);
  const green = (x, y) => pixels.data[(((y + 100) / 2) * pixels.width + (x + 100) / 2) * 4 + 1];
  const before = green(100, 60);
  material.wave(100, 100, 1, 0, 0); material.advance(400);
  assert.equal(renderer.draw(), outline, "the wave cannot move or grow the outline");
  assert(green(100, 60) < before - 2, "the actual rendered surface must show the travelling wave");
  assert(pixels.data.some((value, i) => i % 4 === 1 && pixels.data[i + 2] > 0 && value > resting[i] + 2),
    "the same wave slope must also catch a restrained highlight");
  const early = Uint8ClampedArray.from(pixels.data);
  material.advance(700); renderer.draw();
  assert(pixels.data.some((value, index) => value !== early[index]), "successive frames show propagation");
  material.state.reducedMotion = true; renderer.draw();
  assert.deepEqual(pixels.data, resting, "reduced motion hides even an already existing wave");
  material.state.reducedMotion = false;
  run(material, 700, 5000); renderer.draw();
  assert.deepEqual(pixels.data, resting);
  assert.equal(material.state.waves.length, 0); assert.equal(material.state.active, false);
  assert(clips >= 5, "each wave frame is clipped to the current membrane path");
});
