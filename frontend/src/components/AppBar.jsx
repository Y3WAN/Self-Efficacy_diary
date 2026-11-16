import { useState } from "react";
import SideBar from "./SideBar";

export default function AppBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <header className="appbar">
        <button
          className="hamburger"
          aria-label="메뉴 열기"
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          onClick={() => setSidebarOpen(true)}
        >☰</button>
        <span className="appbar-title">🌱 codemyworld</span>
      </header>
      <SideBar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
