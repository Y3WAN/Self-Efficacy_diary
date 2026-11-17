import { buildDentField } from "./dentField.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FILTER_ID = "button-surface-dent";

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attr, value] of Object.entries(attributes)) {
    element.setAttribute(attr, value);
  }
  return element;
}

export function createButtonDent({ id = FILTER_ID, maxPull = 6, surfaceRadius = null, detailId = null, detailPull = 3.5 } = {}) {
  const trailCanvas = document.createElement("canvas");
  if (!trailCanvas.getContext("2d")) return null;

  const svg = svgElement("svg", { width: 0, height: 0, "aria-hidden": "true" });
  svg.style.position = "absolute";
  svg.style.pointerEvents = "none";
  const filter = svgElement("filter", {
    id,
    filterUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  const dent = svgElement("feImage", { result: "dent", preserveAspectRatio: "none" });
  const merge = svgElement("feMerge", { result: "field" });
  merge.append(svgElement("feMergeNode", { in: "neutral" }), svgElement("feMergeNode", { in: "dent" }));
  const displacement = svgElement("feDisplacementMap", {
    in: "SourceGraphic", in2: "field", xChannelSelector: "R", yChannelSelector: "G", scale: 0,
    result: "deformed",
  });
  const shade = svgElement("feImage", { result: "shade", preserveAspectRatio: "none" });
  const clippedShade = svgElement("feComposite", {
    in: "shade", in2: "deformed", operator: "in", result: "clipped-shade",
  });
  const shadedSurface = svgElement("feMerge", {});
  shadedSurface.append(svgElement("feMergeNode", { in: "deformed" }),
    svgElement("feMergeNode", { in: "clipped-shade" }));
  // Composite the shadow after deformation so the groove cannot distort its own shading.
  filter.append(svgElement("feFlood", { "flood-color": "#808080", result: "neutral" }),
    dent, merge, displacement, shade, clippedShade, shadedSurface);
  const defs = svgElement("defs", {});
  defs.append(filter);
  let detailFilter;
  let detailImage;
  let detailDisplacement;
  if (detailId) {
    detailFilter = svgElement("filter", { id: detailId, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
    detailImage = svgElement("feImage", { result: "detail-dent", preserveAspectRatio: "none" });
    const detailMerge = svgElement("feMerge", { result: "detail-field" });
    detailMerge.append(svgElement("feMergeNode", { in: "detail-neutral" }), svgElement("feMergeNode", { in: "detail-dent" }));
    detailDisplacement = svgElement("feDisplacementMap", { in: "SourceGraphic", in2: "detail-field",
      xChannelSelector: "R", yChannelSelector: "G", scale: 0 });
    detailFilter.append(svgElement("feFlood", { "flood-color": "#808080", result: "detail-neutral" }),
      detailImage, detailMerge, detailDisplacement);
    defs.append(detailFilter);
  }
  svg.append(defs);
  document.body.append(svg);

  let pull = 0;
  const shadeCanvas = document.createElement("canvas");

  function position(x, y, width, height, diameter, depth = 0) {
    trace([{ x: x / width, y: y / height, depth }], width, height, diameter);
  }
  function trace(points, width, height, diameter, protectedCircle = null) {
    if (!points?.length || !diameter || !width || !height) {
      shade.removeAttribute("href");
      setDepth(0);
      return;
    }
    const field = buildDentField(points, width, height, diameter, surfaceRadius, protectedCircle);
    trailCanvas.width = shadeCanvas.width = field.columns;
    trailCanvas.height = shadeCanvas.height = field.rows;
    const context = trailCanvas.getContext("2d");
    const shadeContext = shadeCanvas.getContext("2d");
    if (!context || !shadeContext) return;
    const pixels = context.createImageData(field.columns, field.rows);
    const shadePixels = shadeContext.createImageData(field.columns, field.rows);
    pixels.data.set(field.displacement);
    shadePixels.data.set(field.shade);
    context.putImageData(pixels, 0, 0);
    shadeContext.putImageData(shadePixels, 0, 0);
    const mapUrl = trailCanvas.toDataURL();
    const shadeUrl = shadeCanvas.toDataURL();
    for (const [element, url] of [[dent, mapUrl], [shade, shadeUrl], [detailImage, mapUrl]]) {
      if (!element) continue;
      element.setAttribute("href", url);
      element.setAttribute("x", field.left);
      element.setAttribute("y", field.top);
      element.setAttribute("width", field.width);
      element.setAttribute("height", field.height);
    }
    const tipRadius = protectedCircle ? protectedCircle.radius * Math.min(width, height) + 24 : 0;
    const filterLeft = protectedCircle ? Math.min(field.left, protectedCircle.x * width - tipRadius) : field.left;
    const filterTop = protectedCircle ? Math.min(field.top, protectedCircle.y * height - tipRadius) : field.top;
    const filterRight = protectedCircle ? Math.max(field.left + field.width, protectedCircle.x * width + tipRadius)
      : field.left + field.width;
    const filterBottom = protectedCircle ? Math.max(field.top + field.height, protectedCircle.y * height + tipRadius)
      : field.top + field.height;
    // The depth grid stays fixed, while the filter must still pass the entire outside tip through.
    filter.setAttribute("x", filterLeft);
    filter.setAttribute("y", filterTop);
    filter.setAttribute("width", filterRight - filterLeft);
    filter.setAttribute("height", filterBottom - filterTop);
    if (detailFilter) {
      detailFilter.setAttribute("x", field.left);
      detailFilter.setAttribute("y", field.top);
      detailFilter.setAttribute("width", field.width);
      detailFilter.setAttribute("height", field.height);
    }
    pull = Math.min(maxPull, Math.min(width, height) * 0.1);
    setDepth(1);
  }
  function setDepth(depth) {
    displacement.setAttribute("scale", (pull * depth).toFixed(2));
    detailDisplacement?.setAttribute("scale", (detailPull * depth).toFixed(2));
  }

  return { position, trace, setDepth, dispose: () => svg.remove() };
}
