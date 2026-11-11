const GRID_SIZE = 80;
const FLAT_SIZE = GRID_SIZE * 2;
const STEP_MS = 1000 / 120;
const MAX_FRAME_MS = 50;
const WAVE_SPEED_SQUARED = 0.38;
const DROP_RADIUS = 4;
const DROP_STRENGTH = 1.6;
const RIM_START = 0.8;
const EDGE_DROP_BOOST = 0.7;
const EDGE_DROP_INSET = DROP_RADIUS / 2;
const OUTER_EDGE_DROP_INSET = DROP_RADIUS * 0.4;
const REST_THRESHOLD = 0.008;
const FRONT_THRESHOLD = 0.015;
const FLAT_MAX_OPACITY = 0.43;
const FLAT_FRONT_SOFTNESS = 0.068;
const GEL_FRONT_SOFTNESS = 0.12;
const GEL_MAX_OPACITY = 0.62;
const WIDTH_REFERENCE_PERCENT = 100;
const CREST_SOFTENING_THRESHOLD = 0.68;
const CREST_SOFTENING = 0.5;

export const RIPPLE_WIDTH_PERCENT = Object.freeze({ min: 65, max: 150, step: 5, initial: 110 });

function rimProgress(distanceRatio) {
  return Math.max(0, Math.min(1, (distanceRatio - RIM_START) / (1 - RIM_START)));
}

export function createMallangSurface(canvas, bodyRadius) {
  const context = canvas.getContext("2d");
  if (!context) return null;

  canvas.width = FLAT_SIZE;
  canvas.height = FLAT_SIZE;
  const flatImage = context.createImageData(FLAT_SIZE, FLAT_SIZE);
  const gelImage = context.createImageData(GRID_SIZE, GRID_SIZE);
  const pixelCount = GRID_SIZE * GRID_SIZE;
  let heights = new Float32Array(pixelCount);
  let previousHeights = new Float32Array(pixelCount);
  const damping = new Float32Array(pixelCount);
  const edgeOpacity = new Float32Array(pixelCount);
  const downwardSpeeds = new Float32Array(pixelCount);
  const sampleCell = new Uint8Array(FLAT_SIZE);
  const sampleBlend = new Float32Array(FLAT_SIZE);
  const flatEdgeOpacity = new Float32Array(FLAT_SIZE * FLAT_SIZE);
  const rowPeaks = new Uint8Array(FLAT_SIZE * FLAT_SIZE);
  const center = (GRID_SIZE - 1) / 2;
  const radius = bodyRadius * (GRID_SIZE - 1);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = null;
  let lastFrame = null;
  let pendingTime = 0;
  let isGel = false;
  let ringEdgeExponent = 1;

  for (let y = 1; y < GRID_SIZE - 1; y++) {
    for (let x = 1; x < GRID_SIZE - 1; x++) {
      const distance = Math.hypot(x - center, y - center) / radius;
      if (distance >= 1) continue;
      const index = y * GRID_SIZE + x;
      // Absorb most of the wave near the rim so repeated taps don't ring indefinitely.
      const rim = rimProgress(distance);
      damping[index] = 0.989 - rim * rim * 0.36;
      edgeOpacity[index] = 1 - rim * rim;
    }
  }

  for (let pixel = 0; pixel < FLAT_SIZE; pixel++) {
    const position = Math.max(0, Math.min(GRID_SIZE - 1, (pixel + 0.5) * GRID_SIZE / FLAT_SIZE - 0.5));
    sampleCell[pixel] = Math.min(GRID_SIZE - 2, Math.floor(position));
    sampleBlend[pixel] = position - sampleCell[pixel];
  }
  for (let y = 0; y < FLAT_SIZE; y++) {
    for (let x = 0; x < FLAT_SIZE; x++) {
      const distance = Math.hypot(x + 0.5 - FLAT_SIZE / 2, y + 0.5 - FLAT_SIZE / 2);
      const rim = rimProgress(distance / (radius * FLAT_SIZE / GRID_SIZE));
      const offset = y * FLAT_SIZE + x;
      flatEdgeOpacity[offset] = Math.max(0, 1 - rim * rim);
      flatImage.data[offset * 4] = 208;
      flatImage.data[offset * 4 + 1] = 104;
      flatImage.data[offset * 4 + 2] = 148;
    }
  }

  function step() {
    let peakMotion = 0;
    for (let index = GRID_SIZE; index < pixelCount - GRID_SIZE; index++) {
      if (!damping[index]) continue;
      const height = heights[index];
      const adjacent = heights[index - 1] + heights[index + 1] +
        heights[index - GRID_SIZE] + heights[index + GRID_SIZE];
      const diagonal = heights[index - GRID_SIZE - 1] + heights[index - GRID_SIZE + 1] +
        heights[index + GRID_SIZE - 1] + heights[index + GRID_SIZE + 1];
      // Including diagonal neighbors keeps a drop round as it travels across the grid.
      const curvature = (4 * adjacent + diagonal - 20 * height) / 6;
      const velocity = (height - previousHeights[index]) * damping[index] +
        WAVE_SPEED_SQUARED * curvature;
      const nextHeight = height + velocity;
      previousHeights[index] = nextHeight;
      peakMotion = Math.max(peakMotion, Math.abs(nextHeight), Math.abs(velocity));
    }
    // The previous buffer is also the output buffer because only its own cell is read.
    const steppedHeights = previousHeights;
    previousHeights = heights;
    heights = steppedHeights;
    return peakMotion;
  }

  function shapeRingOpacity(image, size, maxOpacity) {
    const softeningThreshold = maxOpacity * 255 * CREST_SOFTENING_THRESHOLD;

    const { data } = image;
    const windowRadius = size === FLAT_SIZE ? 4 : 2;
    for (let y = 0; y < size; y++) {
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const first = row + Math.max(0, x - windowRadius);
        const last = row + Math.min(size - 1, x + windowRadius);
        let peak = 0;
        for (let pixel = first; pixel <= last; pixel++) {
          peak = Math.max(peak, data[pixel * 4 + 3]);
        }
        rowPeaks[row + x] = peak;
      }
    }

    // Adjust width relative to the crest, and soften only the strongest crests
    // so the first flash is gentler without shortening the tail of the ripple.
    for (let y = 0; y < size; y++) {
      const firstRow = Math.max(0, y - windowRadius) * size;
      const lastRow = Math.min(size - 1, y + windowRadius) * size;
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4 + 3;
        const alpha = data[offset];
        if (!alpha) continue;

        let peak = alpha;
        for (let row = firstRow; row <= lastRow; row += size) {
          peak = Math.max(peak, rowPeaks[row + x]);
        }
        const softenedPeak = peak - Math.max(0, peak - softeningThreshold) * CREST_SOFTENING;
        data[offset] = softenedPeak * (alpha / peak) ** ringEdgeExponent;
      }
    }
  }

  function drawFlat() {
    for (let index = GRID_SIZE; index < pixelCount - GRID_SIZE; index++) {
      downwardSpeeds[index] = previousHeights[index] - heights[index];
    }

    // Blend the simulated speeds before converting them to opacity so the front
    // can travel between grid cells without a stepped outline.
    for (let y = 0; y < FLAT_SIZE; y++) {
      const row = sampleCell[y] * GRID_SIZE;
      const blendY = sampleBlend[y];
      for (let x = 0; x < FLAT_SIZE; x++) {
        const pixel = y * FLAT_SIZE + x;
        if (!flatEdgeOpacity[pixel]) continue;
        const topLeft = row + sampleCell[x];
        const bottomLeft = topLeft + GRID_SIZE;
        const blendX = sampleBlend[x];
        const top = downwardSpeeds[topLeft] * (1 - blendX) + downwardSpeeds[topLeft + 1] * blendX;
        const bottom = downwardSpeeds[bottomLeft] * (1 - blendX) + downwardSpeeds[bottomLeft + 1] * blendX;
        const front = Math.max(0, top * (1 - blendY) + bottom * blendY - FRONT_THRESHOLD);
        const coverage = (front / FLAT_FRONT_SOFTNESS) ** 3;
        const opacity = FLAT_MAX_OPACITY * coverage / (1 + coverage);
        flatImage.data[pixel * 4 + 3] = opacity * flatEdgeOpacity[pixel] * 255;
      }
    }
    shapeRingOpacity(flatImage, FLAT_SIZE, FLAT_MAX_OPACITY);
    context.putImageData(flatImage, 0, 0);
  }

  function drawGel() {
    const { data } = gelImage;
    for (let index = GRID_SIZE; index < pixelCount - GRID_SIZE; index++) {
      if (!damping[index]) continue;
      const front = Math.max(0, previousHeights[index] - heights[index] - FRONT_THRESHOLD);
      const offset = index * 4;
      // A light above and to the left follows the same surface as the body highlight.
      const slopeX = heights[index + 1] - heights[index - 1];
      const slopeY = heights[index + GRID_SIZE] - heights[index - GRID_SIZE];
      const light = Math.max(0, Math.min(1, 0.5 + (slopeX * 0.6 + slopeY * 0.8) / (0.2 + front * 4)));
      data[offset] = 146 + light * 109;
      data[offset + 1] = 48 + light * 204;
      data[offset + 2] = 98 + light * 155;
      data[offset + 3] = GEL_MAX_OPACITY * front / (front + GEL_FRONT_SOFTNESS) * edgeOpacity[index] * 255;
    }
    shapeRingOpacity(gelImage, GRID_SIZE, GEL_MAX_OPACITY);
    context.putImageData(gelImage, 0, 0);
  }

  function draw() {
    if (isGel) drawGel();
    else drawFlat();
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastFrame = null;
    pendingTime = 0;
    heights.fill(0);
    previousHeights.fill(0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function animate(timestamp) {
    frame = null;
    if (reducedMotion.matches) {
      stop();
      return;
    }

    if (lastFrame !== null) pendingTime += Math.min(timestamp - lastFrame, MAX_FRAME_MS);
    lastFrame = timestamp;
    if (pendingTime >= STEP_MS) {
      let peakMotion;
      while (pendingTime >= STEP_MS) {
        peakMotion = step();
        pendingTime -= STEP_MS;
      }
      if (peakMotion < REST_THRESHOLD) {
        stop();
        return;
      }
      draw();
    }
    frame = requestAnimationFrame(animate);
  }

  function addDrop(x, y) {
    if (reducedMotion.matches) return;

    const offsetX = x * (GRID_SIZE - 1) - center;
    const offsetY = y * (GRID_SIZE - 1) - center;
    const distance = Math.hypot(offsetX, offsetY);
    // Start taps on the outline far enough inside for the first arc to be visible.
    const rim = rimProgress(distance / radius);
    const inset = EDGE_DROP_INSET + OUTER_EDGE_DROP_INSET * rim ** 3;
    const impactRadius = radius - inset;
    const scale = distance > impactRadius ? impactRadius / distance : 1;
    const strength = DROP_STRENGTH * (1 + EDGE_DROP_BOOST * rim);
    const dropX = center + offsetX * scale;
    const dropY = center + offsetY * scale;
    const firstRow = Math.max(1, Math.ceil(dropY - DROP_RADIUS));
    const lastRow = Math.min(GRID_SIZE - 2, Math.floor(dropY + DROP_RADIUS));
    const firstColumn = Math.max(1, Math.ceil(dropX - DROP_RADIUS));
    const lastColumn = Math.min(GRID_SIZE - 2, Math.floor(dropX + DROP_RADIUS));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const distanceSquared = (column - dropX) ** 2 + (row - dropY) ** 2;
        const weight = 1 - distanceSquared / DROP_RADIUS ** 2;
        const index = row * GRID_SIZE + column;
        if (weight > 0 && damping[index]) {
          // Changing the previous height adds downward velocity to the current surface.
          previousHeights[index] += strength * weight ** 2;
        }
      }
    }
    if (frame === null) {
      pendingTime = STEP_MS;
      frame = requestAnimationFrame(animate);
    }
  }

  function setGelStyle(enabled) {
    if (isGel === enabled) return;
    isGel = enabled;
    const size = isGel ? GRID_SIZE : FLAT_SIZE;
    canvas.width = size;
    canvas.height = size;
    if (frame !== null) draw();
  }

  function setWidthPercent(percent) {
    if (!Number.isFinite(percent)) return;
    const { min, max } = RIPPLE_WIDTH_PERCENT;
    const width = Math.max(min, Math.min(max, percent));
    ringEdgeExponent = (WIDTH_REFERENCE_PERCENT / width) ** 2;
    if (frame !== null) draw();
  }

  setWidthPercent(RIPPLE_WIDTH_PERCENT.initial);
  return { addDrop, stop, setGelStyle, setWidthPercent };
}
