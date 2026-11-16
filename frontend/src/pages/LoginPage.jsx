import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import client from "../api/client";
import { todayKST } from "../utils/date";

export default function LoginPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [trialLoading, setTrialLoading] = useState(false);

  // 부스 체험: 관람객마다 임시 계정을 새로 만들어 바로 오늘 일기 화면으로
  const startTrial = async () => {
    setError("");
    setTrialLoading(true);
    try {
      const { data } = await client.post("/api/auth/trial");
      setToken(data.access_token);
      const { data: me } = await client.get("/api/auth/me");
      setUser(me);
      navigate("/", { replace: true });
      navigate(`/diary/${todayKST()}`, { state: { fromMain: true } });
    } catch {
      setError("체험 계정을 만들지 못했어요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setTrialLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await client.post("/api/auth/login", form);
      setToken(data.access_token);
      const { data: me } = await client.get("/api/auth/me");
      setUser(me);
      navigate("/");
    } catch {
      setError("아이디 또는 비밀번호가 올바르지 않아요.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">codemyworld</h1>
        <p className="auth-sub">오늘의 나를 기록해요</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="auth-input"
            placeholder="아이디"
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="비밀번호"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit">로그인</button>
        </form>
        <button className="auth-btn auth-btn--trial" type="button" onClick={startTrial} disabled={trialLoading}>
          {trialLoading ? "준비 중…" : "✨ 가입 없이 체험하기"}
        </button>
        <p className="auth-trial-note">체험 기록은 행사 후 모두 삭제돼요</p>
        <p className="auth-link">
          처음이신가요? <Link to="/signup">회원가입</Link>
        </p>
      </div>
    </div>
  );
}
