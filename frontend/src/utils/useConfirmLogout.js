import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function useConfirmLogout() {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  return () => {
    if (!window.confirm("로그아웃할까요?")) return;
    logout();
    navigate("/login", { replace: true });
  };
}
