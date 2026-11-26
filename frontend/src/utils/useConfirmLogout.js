import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function useConfirmLogout() {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const pending = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setError("");
    setIsOpen(true);
  }

  function cancel() {
    if (!pending.current) setIsOpen(false);
  }

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setIsPending(true);
    setError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  }

  return { isOpen, isPending, error, open, cancel, confirm };
}
