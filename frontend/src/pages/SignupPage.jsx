import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import client from "../api/client";

const QUESTIONS = [
  { key: "answer_m", label: "최근에 어렵거나 힘든 일을 스스로 해냈다고 느낀 적이 얼마나 있나요?" },
  { key: "answer_v", label: "나와 비슷한 처지의 사람이 성공하는 모습을 보고 자극받은 적이 있나요?" },
  { key: "answer_p", label: "가족, 친구 등 주변 사람들이 나를 믿어주거나 격려해준다고 느끼나요?" },
  { key: "answer_a", label: "평소에 감정이 안정되고 컨디션이 괜찮다고 느끼나요?" },
];

const OPTIONS = ["전혀", "별로", "보통", "자주", "항상"];

export default function SignupPage() {
  const [form, setForm] = useState({
    username: "", password: "",
    answer_m: 3, answer_v: 3, answer_p: 3, answer_a: 3,
  });
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
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="비밀번호"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {QUESTIONS.map(({ key, label }) => (
            <div key={key} className="survey-group">
              <p className="survey-label">{label}</p>
              <div className="survey-options">
                {OPTIONS.map((opt, i) => (
                  <label key={i} className={`grade-btn ${form[key] === i + 1 ? "active" : ""}`}>
                    <input
                      type="radio"
                      name={key}
                      value={i + 1}
                      checked={form[key] === i + 1}
                      onChange={() => setForm({ ...form, [key]: i + 1 })}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
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
