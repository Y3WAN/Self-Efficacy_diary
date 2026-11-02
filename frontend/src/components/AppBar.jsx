import { useState } from "react";
import SideBar from "./SideBar";

export default function AppBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <header className="appbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
        <span className="appbar-title">🌱 codemyworld</span>
      </header>
      <SideBar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
