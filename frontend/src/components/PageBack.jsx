import { useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";

export default function PageBack({ label = "뒤로", onClick, buttonRef }) {
  const navigate = useNavigate();
  const { state } = useLocation();

  function goBack() {
    if (state?.fromMain || state?.fromApp) navigate(-1);
    else navigate("/", { replace: true, state: { scrollToTop: true } });
  }

  return (
    <button ref={buttonRef} type="button" className="page-back" aria-label={label} onClick={onClick ?? goBack}>
      <Icon name="arrowLeft" />
      <span>{label}</span>
    </button>
  );
}
