import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import client from "../api/client";
import BrandMark from "../components/BrandMark";

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
        <h1 className="auth-title"><BrandMark /></h1>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-field">
            <span>아이디</span>
            <input
              className="auth-input"
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </label>
          <label className="auth-field">
            <span>비밀번호</span>
            <input
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-btn" type="submit">로그인</button>
        </form>
        <Link to="/try" className="auth-btn auth-btn--trial">✨ 가입 없이 1분 체험하기</Link>
        <p className="auth-trial-note">체험 기록은 행사 후 모두 삭제돼요</p>
        <p className="auth-link">
          <Link to="/signup">회원가입</Link>
        </p>
      </div>
    </div>
  );
}
