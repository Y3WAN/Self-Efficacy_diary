import React from "react";
import { createRoot } from "react-dom/client";
import Harness from "./mallang-browser";

if (import.meta.env.DEV) {
  const url = new URL(location.href);
  if (!url.searchParams.has("inspect")) { url.searchParams.set("inspect", "1"); history.replaceState(null, "", url); }
  if (url.searchParams.has("reduced")) {
    const native = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === "(prefers-reduced-motion: reduce)" ?
      { matches: true, addEventListener() {}, removeEventListener() {} } : native(query);
  }
  createRoot(document.getElementById("root")).render(<React.StrictMode><Harness /></React.StrictMode>);
}
