import { Link } from "react-router-dom";
import BrandMark from "./BrandMark";

export default function AppBar() {
  return (
    <header className="appbar">
      <Link to="/" className="brand-home" aria-label="코드마이월드 메인 화면" state={{ scrollToTop: true }}>
        <BrandMark />
      </Link>
    </header>
  );
}
