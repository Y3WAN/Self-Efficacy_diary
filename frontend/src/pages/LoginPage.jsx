import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import client from "../api/client";

export default function LoginPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuthStore();
  const navigate = useNavigate();

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
        <h1 className="auth-title">성장 기록</h1>
        <p className="auth-sub">오늘의 나를 기록해요</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="auth-input"
            placeholder="아이디"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="비밀번호"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit">로그인</button>
        </form>
        <p className="auth-link">
          처음이신가요? <Link to="/signup">회원가입</Link>
        </p>
      </div>
    </div>
  );
}
