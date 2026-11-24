import { useState } from "react";
import Icon from "../components/Icon";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import AppBar from "../components/AppBar";

const SOURCES = [
  ["이론", "Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. Psychological Review, 84(2), 191–215. — 자기효능감 4원천(성취경험·대리경험·사회적 설득·정서 상태)"],
  ["난이도 조절", "Elo, A. E. (1978). The Rating of Chessplayers, Past and Present. — 미션 난이도 조절에 ELO 레이팅 공식 사용"],
  ["생성형 AI", "OpenAI gpt-oss-120b (Apache 2.0 오픈 웨이트 모델), Groq API로 호출 — 일기 분석, 미션 문장 생성"],
  ["프론트엔드", "React, Vite, Recharts, TanStack Query, Zustand, React Router (MIT License)"],
  ["백엔드", "FastAPI, SQLAlchemy, APScheduler, PostgreSQL"],
  ["글꼴", "물방울체 (유정연·스스로넷), 주아체 (우아한형제들)"],
  ["왁뿌볼 효과음", <a href="https://www.youtube.com/shorts/WIzw3eDxDA0">VIVAASMR 쇼츠</a>],
];

const BRAND_COLORS = [
  { name: "브랜드 핑크", token: "--accent", hex: "#934361" },
  { name: "밝은 핑크", token: "--accent-soft", hex: "#F7E3EC" },
  { name: "페이지 배경", token: "--bg", hex: "#FBF6F7" },
  { name: "기본 글자", token: "--text", hex: "#302B31" },
];

export default function AboutPage() {
  const { token } = useAuthStore();
  const [isSampleSelected, setIsSampleSelected] = useState(false);

  return (
    <div className="main-page">
      {token && <AppBar />}
      <main className="main-content">
        <header className="page-heading">
          <h1>codemyworld 안내</h1>
        </header>
        <div className="chart-card">
          <h2 className="chart-title">서비스 소개</h2>
          <div className="about-text">
            <p>codemyworld는 일기를 쓰면 AI가 '나도 할 수 있다'는 자신감(자기효능감)을 키우는 4가지 경험을 찾아 주고, 지금 실력에 맞는 작은 미션을 주는 <b>나를 돌아보는 연습 도구</b>예요.</p>
            <p className="notice-box">
              <Icon name="warning" /> 이 서비스는 <b>전문 심리 검사나 상담을 대신하지 않아요.</b> 점수는 AI가 짐작한 값이라 틀릴 수 있어요.
              마음이 많이 힘들다면 청소년상담 1388(전화·문자·카카오톡)에 도움을 요청하세요.
            </p>
            <p>실명, 학교, 연락처 같은 개인정보는 일기에 쓰지 마세요. 일기 내용은 분석을 위해 AI 서버로 보내져요.</p>
          </div>
        </div>
        <div className="chart-card">
          <h2 className="chart-title">출처</h2>
          <ul className="about-sources">
            {SOURCES.map(([k, v]) => (
              <li key={k}><span>{k}</span>{v}</li>
            ))}
          </ul>
        </div>
        <section className="chart-card design-guide" aria-labelledby="design-guide-title">
          <h2 id="design-guide-title" className="chart-title">디자인 가이드</h2>
          <div>
            <h3>타이포그래피</h3>
            <ul className="design-guide-list">
              <li>
                <p className="design-guide-title-sample">오늘의 기록</p>
                <p className="design-guide-meta">제목 · 물방울체 · 24px</p>
              </li>
              <li>
                <p className="design-guide-body-sample">오늘의 나를 기록해요.</p>
                <p className="design-guide-meta">본문 · 주아체 · 15px</p>
              </li>
            </ul>
          </div>
          <div>
            <h3>브랜드 컬러</h3>
            <ul className="design-guide-list">
              {BRAND_COLORS.map(({ name, token, hex }) => (
                <li key={token}>
                  <span className="design-guide-swatch" style={{ "--guide-swatch": "var(" + token + ")" }} aria-hidden="true" />
                  <span>{name}</span>
                  <code className="design-guide-meta">{hex}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>여백과 카드</h3>
            <figure className="design-guide-layout">
              <div className="design-guide-layout-sample" aria-hidden="true">
                <span>카드 안쪽 여백</span>
              </div>
              <figcaption className="design-guide-meta">
                화면 양옆 14–28px · 카드 안쪽과 섹션 사이 14–22px · 카드 모서리 16px
              </figcaption>
            </figure>
          </div>
          <div>
            <h3>버튼과 상태</h3>
            <div className="design-guide-controls">
              <button type="button" className="auth-btn design-guide-toggle" aria-pressed={isSampleSelected}
                onClick={() => setIsSampleSelected((selected) => !selected)}>
                선택 예시
              </button>
              <span className="activity-status activity-status--done"><Icon name="check" /> 완료</span>
            </div>
            <p className="design-guide-meta">
              버튼은 높이 44px 이상을 기준으로 해요. Tab 키로 선택 예시의 포커스 테두리를 확인할 수 있어요.
              완료 같은 상태는 색상과 문구를 함께 표시해요.
            </p>
          </div>
        </section>
        {!token && <p className="auth-link"><Link to="/login">로그인으로 돌아가기</Link></p>}
      </main>
    </div>
  );
}
