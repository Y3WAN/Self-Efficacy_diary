import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import client from "../api/client";

const GRADES = ["상", "중상", "중", "중하", "하"];

export default function SignupPage() {
  const [form, setForm] = useState({ username: "", password: "", initial_grade: "중" });
  const [error, setError] = useState("");
  const { setToken, setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await client.post("/api/auth/signup", form);
      setToken(data.access_token);
      const { data: me } = await client.get("/api/auth/me");
      setUser(me);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail === "Username already exists"
        ? "이미 사용 중인 아이디예요."
        : "회원가입에 실패했어요.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">회원가입</h1>
        <p className="auth-sub">나의 성장 여정을 시작해요</p>
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
          <div className="grade-group">
            <p className="grade-label">현재 학업 수준</p>
            <div className="grade-options">
              {GRADES.map((g) => (
                <label key={g} className={`grade-btn ${form.initial_grade === g ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="grade"
                    value={g}
                    checked={form.initial_grade === g}
                    onChange={() => setForm({ ...form, initial_grade: g })}
                  />
                  {g}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit">시작하기</button>
        </form>
        <p className="auth-link">
          이미 계정이 있나요? <Link to="/login">로그인</Link>
        </p>
      </div>
    </div>
  );
}
