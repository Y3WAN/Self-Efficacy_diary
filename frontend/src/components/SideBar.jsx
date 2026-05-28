import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export default function SideBar({ open, onClose }) {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const go = (path) => { onClose(); navigate(path); };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <nav className={`sidebar ${open ? "open" : ""}`}>
        <button className="sidebar-close" onClick={onClose}>✕</button>
        <ul className="sidebar-menu">
          <li className={isActive("/") ? "active" : ""} onClick={() => go("/")}>🏠 메인화면</li>
          <li className={isActive("/dashboard") ? "active" : ""} onClick={() => go("/dashboard")}>📊 대시보드</li>
          <li className={isActive("/profile") ? "active" : ""} onClick={() => go("/profile")}>👤 내 정보</li>
          <li className={isActive("/community") ? "active" : ""} onClick={() => go("/community")}>🌍 커뮤니티</li>
          <li className="sidebar-logout" onClick={() => { logout(); go("/login"); }}>🚪 로그아웃</li>
        </ul>
      </nav>
    </>
  );
}
