import { Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import AppBar from "../components/AppBar";

const SOURCES = [
  ["이론", "Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. Psychological Review, 84(2), 191–215. — 자기효능감 4원천(성취경험·대리경험·사회적 설득·정서 상태)"],
  ["난이도 조절", "Elo, A. E. (1978). The Rating of Chessplayers, Past and Present. — 미션 난이도 조절에 ELO 레이팅 공식 사용"],
  ["생성형 AI", "OpenAI gpt-oss-120b (Apache 2.0 오픈 웨이트 모델), Groq API로 호출 — 일기 분석, 미션 문장 생성"],
  ["프론트엔드", "React, Vite, Recharts, TanStack Query, Zustand, React Router (MIT License)"],
  ["백엔드", "FastAPI, SQLAlchemy, APScheduler, PostgreSQL"],
  ["글꼴", "Pretendard (SIL Open Font License)"],
];

export default function AboutPage() {
  const { token } = useAuthStore();

  return (
    <div className="main-page">
      {token && <AppBar />}
      <div className="main-content">
        <div className="chart-card">
          <h3 className="chart-title">codemyworld 안내</h3>
          <div className="about-text">
            <p>codemyworld는 일기를 쓰면 AI가 자기효능감의 4가지 원천을 분석하고, 지금 실력에 맞는 작은 미션을 주는 <b>학습용 자기 성찰 도구</b>예요.</p>
            <p className="notice-box">
              ⚠️ 이 서비스는 <b>심리 진단·상담 도구가 아니에요.</b> 점수는 AI의 추정이며 틀릴 수 있어요.
              마음이 많이 힘들다면 청소년상담 1388(전화·문자·카카오톡)에 도움을 요청하세요.
            </p>
            <p>실명, 학교, 연락처 같은 개인정보는 일기에 쓰지 마세요. 일기 내용은 분석을 위해 AI API로 전송돼요.</p>
          </div>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">출처</h3>
          <ul className="about-sources">
            {SOURCES.map(([k, v]) => (
              <li key={k}><span>{k}</span>{v}</li>
            ))}
          </ul>
        </div>
        {!token && <p className="auth-link"><Link to="/login">로그인으로 돌아가기</Link></p>}
      </div>
    </div>
  );
}
