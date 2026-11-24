import { useLayoutEffect } from "react";
import { Link, matchPath, Outlet, useLocation, useNavigationType } from "react-router-dom";
import Icon from "./Icon";
import { useAuthStore } from "../store/auth";

const TABS = [
  { to: "/", icon: "home", label: "메인화면", relatedPaths: ["/records/:date", "/analysis"] },
  { to: "/mallang", icon: "mallang", label: "마음 쉬기", relatedPaths: [] },
  { to: "/profile", icon: "user", label: "내 정보", relatedPaths: ["/prompt", "/community"] },
];

export default function AppNavigationLayout() {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType !== "POP" && location.state?.scrollToTop) window.scrollTo(0, 0);
  }, [location, navigationType]);

  if (!token) return <Outlet />;

  return (
    <div className="app-with-bottom-nav">
      <Outlet />
      <nav className="app-bottom-nav" aria-label="주 메뉴">
        {TABS.map(({ to, icon, label, relatedPaths }) => {
          const isCurrentPage = matchPath(to, location.pathname) !== null;
          const isCurrentSection = relatedPaths.some((path) => matchPath(path, location.pathname));
          return (
            <Link
              key={to}
              to={to}
              className="app-bottom-nav-link"
              data-ripple-navigation
              aria-label={label}
              aria-current={isCurrentPage ? "page" : isCurrentSection ? "true" : undefined}
              title={label}
              replace={isCurrentPage && !location.search}
              state={{ scrollToTop: true }}
            >
              <span className="app-bottom-nav-icon"><Icon name={icon} /></span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
