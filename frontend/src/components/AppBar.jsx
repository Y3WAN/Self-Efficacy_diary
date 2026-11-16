import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SideBar from "./SideBar";
import { useAuthStore } from "../store/auth";

export default function AppBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const isTrial = user?.username?.startsWith("guest_");

  // 부스: 다음 관람객을 위해 체험 계정에서 나가기
  const nextVisitor = () => {
    if (!window.confirm("체험을 마치고 다음 사람에게 넘길까요?")) return;
    logout();
    navigate("/login", { replace: true });
  };

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
        {isTrial && <button className="appbar-next" onClick={nextVisitor}>체험 끝내기</button>}
      </header>
      <SideBar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
