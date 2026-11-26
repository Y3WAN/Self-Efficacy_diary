import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { getDailyTrendRange, getMallangTrend, TREND_DAYS } from "../src/utils/efficacyTrend.js";
import { createMallangMaterial, getInteractiveMallangGeometry, getMallangFaceFrame,
  materialContact, membraneRadii, sampleMallangContour } from "../src/utils/mallangMaterial.js";
import { shiftRecordDate } from "../src/utils/recordDate.js";

test("the daily trend spans fifteen calendar dates with blanks and retains saved scores", () => {
  const entries = [
    { date: "2026-10-10", ema: .48, score: .48 },
    { date: "2026-10-24", ema: .52, score: .7 },
    { date: "2026-10-26", ema: .52, score: null, has_diary: true, confidence: null },
    { date: "2026-11-10", ema: .68, score: .85 },
  ];
  const today = "2026-11-06";
  const start = shiftRecordDate(today, 1 - TREND_DAYS);
  const days = getDailyTrendRange(entries, start, today);
  assert.equal(days.length, 15);
  assert.equal(days[0].date, "2026-10-23");
  assert.equal(days[0].ema, .48);
  assert.equal(days[1].date, "2026-10-24");
  assert.equal(days[1].score, .7);
  assert.equal(days[2].score, null);
  assert.equal(days[3].has_diary, true);
  assert.equal(days[9].date, "2026-11-01");
  assert.equal(days.at(-1).date, today);
  assert.equal(getDailyTrendRange([], start, today).every(day => day.score === null && day.ema === null), true);
});

test("the graph date follows the browser calendar around UTC midnight", () => {
  const moduleUrl = new URL("../src/utils/date.js", import.meta.url);
  const script = `import { dateLocal } from "${moduleUrl}";
    console.log(dateLocal(Date.parse("2026-10-24T17:00:00Z")));`;
  for (const [zone, expected] of [["Asia/Seoul", "2026-10-25"], ["America/Los_Angeles", "2026-10-24"]]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8", env: { ...process.env, TZ: zone },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
});

test("the interactive material uses the same shape ratios as the radar and still deforms", () => {
  const trend = getMallangTrend([{ ema: .63, ema_contributions: { M: .36, V: .14, P: .08, A: .05 } }]);
  const plot = sampleMallangContour(trend.contour, 84);
  const material = createMallangMaterial();
  const geometry = getInteractiveMallangGeometry(trend.contour);
  material.restRadii = geometry.radii;
  const rest = membraneRadii(material);
  for (let i = 0; i < rest.length; i++) {
    assert.ok(Math.abs(rest[i] / rest[0] - plot[i] / plot[0]) < 1e-6);
  }
  const originalSize = 188;
  const longestAxis = Math.max(rest[0] + rest[48], rest[24] + rest[72]);
  assert.ok(Math.abs(longestAxis * geometry.sizeScale - originalSize) < 1e-5);
  const chartFace = getMallangFaceFrame(trend.contour, 0, 0);
  assert.ok(Math.abs((geometry.face.x - 100) / geometry.face.size - chartFace.x / chartFace.size) < 1e-6);
  assert.ok(Math.abs((geometry.face.y - 100) / geometry.face.size - chartFace.y / chartFace.size) < 1e-6);

  assert.equal(materialContact(material, { x: 200, y: 100 }).radius, rest[0]);
  material.touch(165, 100, 0);
  material.advance(700);
  assert.ok(membraneRadii(material)[0] > rest[0]);
  material.reset();
  assert.deepEqual(membraneRadii(material), rest);
});
