import { useState } from "react";
import { useAuthStore } from "../store/auth";
import { PERSONAS } from "../lib/persona";
import SideBar from "./SideBar";

export default function AppBar() {
  const { user } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const persona = user ? PERSONAS[user.current_persona] : null;

  return (
    <>
      <header className="appbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
        <span className="appbar-title">성장 기록</span>
        {persona && (
          <div className={`persona-badge motion-${persona.motion}`}>
            <span className="persona-emoji">{persona.emoji}</span>
            <span className="persona-name">{persona.label}</span>
          </div>
        )}
      </header>
      <SideBar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
