import Icon from "./Icon";
import BrandMark from "./BrandMark";
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
        ><Icon name="menu" /></button>
        <BrandMark className="appbar-title" />
      </header>
      <SideBar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
