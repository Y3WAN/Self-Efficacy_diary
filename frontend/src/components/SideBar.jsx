import Icon from "./Icon";
import BrandMark from "./BrandMark";
import { NavLink } from "react-router-dom";
import { useConfirmLogout } from "../utils/useConfirmLogout";

const MENU_ITEMS = [
  ["/", "home", "메인화면"],
  ["/dashboard", "chart", "대시보드"],
  ["/mallang", "mallang", "사이버 말랑이"],
  ["/profile", "user", "내 정보"],
];

export default function SideBar({ open, onClose }) {
  const confirmLogout = useConfirmLogout();

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <nav id="app-sidebar" className={`sidebar ${open ? "open" : ""}`} aria-label="주 메뉴" inert={!open}>
        <div className="sidebar-brand">
          <BrandMark />
        </div>
        <button className="sidebar-close" onClick={onClose}><Icon name="close" /> 닫기</button>
        <ul className="sidebar-menu">
          {MENU_ITEMS.map(([path, icon, label]) => (
            <li key={path}>
              <NavLink to={path} end data-ripple-navigation onClick={onClose}><Icon name={icon} />{label}</NavLink>
            </li>
          ))}
          <li><button className="sidebar-logout" onClick={confirmLogout}><Icon name="logout" /> 로그아웃</button></li>
        </ul>
      </nav>
    </>
  );
}
