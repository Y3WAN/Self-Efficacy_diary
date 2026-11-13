import { NavLink } from "react-router-dom";
import { useConfirmLogout } from "../utils/useConfirmLogout";

const MENU_ITEMS = [
  ["/", "🏠 메인화면"],
  ["/dashboard", "📊 대시보드"],
  ["/mallang", "🤖 사이버 말랑이"],
  ["/profile", "👤 내 정보"],
  ["/about", "ℹ️ 안내·출처"],
];

export default function SideBar({ open, onClose }) {
  const confirmLogout = useConfirmLogout();

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <nav id="app-sidebar" className={`sidebar ${open ? "open" : ""}`} aria-label="주 메뉴" inert={!open}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">🌱</span>
          <span className="sidebar-brand-name">codemyworld</span>
        </div>
        <button className="sidebar-close" onClick={onClose}>✕ 닫기</button>
        <ul className="sidebar-menu">
          {MENU_ITEMS.map(([path, label]) => (
            <li key={path}>
              <NavLink to={path} end onClick={onClose}>{label}</NavLink>
            </li>
          ))}
          <li><button className="sidebar-logout" onClick={confirmLogout}>🚪 로그아웃</button></li>
        </ul>
      </nav>
    </>
  );
}
