const rippleTarget = "a[data-ripple-navigation][href^='/']:not([href^='//'])";
const navigationDelay = 160;

function canDelayNavigation(link, event) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
    !link.hasAttribute("download") && (!link.target || link.target === "_self");
}

export function installButtonRipple(root) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const layer = document.createElement("span");
  const ring = document.createElement("span");
  layer.className = "button-ripple";
  layer.setAttribute("aria-hidden", "true");
  ring.className = "button-ripple-ring";
  layer.append(ring);

  let anchor;
  let animation;
  let pendingNavigation;
  let navigationTimer;
  let replayingClick = false;

  function cancelNavigation() {
    window.clearTimeout(navigationTimer);
    pendingNavigation = undefined;
  }

  function continueNavigation() {
    const control = pendingNavigation;
    cancelNavigation();
    if (!control || !root.contains(control) || control.closest("[inert]")) return;

    // Let the existing React Router handler use its original route state and history options.
    replayingClick = true;
    try {
      control.click();
    } finally {
      replayingClick = false;
    }
  }

  function clearRipple() {
    animation?.cancel();
    animation = undefined;
    layer.remove();
    anchor?.classList.remove("button-ripple-anchor");
    anchor = undefined;
  }

  function showRipple(event) {
    if (replayingClick || reducedMotion.matches || event.defaultPrevented ||
        !(event.target instanceof Element) || typeof ring.animate !== "function") return;
    cancelNavigation();
    const link = event.target.closest(rippleTarget);
    if (!link || link.closest("[aria-disabled='true'], [inert]") || !canDelayNavigation(link, event)) return;

    clearRipple();
    const { left, top, width, height } = link.getBoundingClientRect();
    if (!width || !height) return;

    const x = event.detail === 0 ? width / 2 : Math.max(0, Math.min(width, event.clientX - left));
    const y = event.detail === 0 ? height / 2 : Math.max(0, Math.min(height, event.clientY - top));
    const diameter = 2 * Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
    ring.style.left = `${x / width * 100}%`;
    ring.style.top = `${y / height * 100}%`;
    ring.style.width = `${diameter}px`;

    if (getComputedStyle(link).position === "static") {
      anchor = link;
      anchor.classList.add("button-ripple-anchor");
    }
    link.append(layer);
    const currentAnimation = ring.animate([
      { transform: "translate(-50%, -50%) scale(0.08)", opacity: 0.46 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
    ], { duration: 440, easing: "cubic-bezier(.2, .65, .3, 1)" });
    animation = currentAnimation;
    animation.onfinish = () => {
      if (animation === currentAnimation) clearRipple();
    };

    event.preventDefault();
    event.stopPropagation();
    pendingNavigation = link;
    navigationTimer = window.setTimeout(continueNavigation, navigationDelay);
  }

  function handleMotionPreferenceChange() {
    clearRipple();
    if (reducedMotion.matches) continueNavigation();
  }

  root.addEventListener("click", showRipple, true);
  window.addEventListener("popstate", cancelNavigation);
  reducedMotion.addEventListener("change", handleMotionPreferenceChange);
  return () => {
    root.removeEventListener("click", showRipple, true);
    window.removeEventListener("popstate", cancelNavigation);
    reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
    cancelNavigation();
    clearRipple();
  };
}
