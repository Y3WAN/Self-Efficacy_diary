import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import client from "../api/client";

const QUESTIONS = [
  { key: "answer_m", label: "요즘 어려운 일을 스스로 해낸 적이 있나요?" },
  { key: "answer_v", label: "친구가 해내는 걸 보고 '나도 해 볼까?' 생각한 적이 있나요?" },
  { key: "answer_p", label: "주변에서 '넌 할 수 있어'라고 말해 주나요?" },
  { key: "answer_a", label: "요즘 마음과 몸이 편안한 편인가요?" },
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
      const status = err.response?.status;
      setError(
        status === 409 ? "이미 사용 중인 아이디예요."
        : status === 422 ? "아이디는 공백 없이 3~50자, 비밀번호는 4~72자로 입력해 주세요."
        : "회원가입에 실패했어요."
      );
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--signup">
        <h1 className="auth-title">회원가입</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-field">
            <span>아이디</span>
            <input
              className="auth-input"
              autoComplete="username"
              minLength={3}
              maxLength={50}
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
              autoComplete="new-password"
              minLength={4}
              maxLength={72}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          {QUESTIONS.map(({ key, label }) => (
            <fieldset key={key} className="survey-group">
              <legend className="survey-label">{label}</legend>
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
            </fieldset>
          ))}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <p className="notice-text">
            codemyworld는 나를 돌아보는 연습 도구예요. 전문 심리 검사나 상담을 대신하지 않아요.
            실명·연락처 같은 개인정보는 일기에 쓰지 마세요. <Link to="/about">자세히</Link>
          </p>
          <button className="auth-btn" type="submit">시작하기</button>
        </form>
        <p className="auth-link">
          <Link to="/login">로그인</Link>
        </p>
      </div>
    </div>
  );
}
