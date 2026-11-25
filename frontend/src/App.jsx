import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import Icon from "./components/Icon";
import { useAuthStore } from "./store/auth";
import LoginPage from "./pages/LoginPage";
import MainPage from "./pages/MainPage";
import RecordDayPage from "./pages/RecordDayPage";
import RecordLayout from "./components/RecordLayout";
import AppNavigationLayout from "./components/AppNavigationLayout";
import { installButtonRipple } from "./utils/buttonRipple";

// 메인 화면에 필요 없는 페이지는 들어갈 때 따로 불러온다 (첫 로딩을 가볍게)
const DiaryEditorPage = lazy(() => import("./pages/DiaryEditorPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const PromptPage = lazy(() => import("./pages/PromptPage"));
const MallangPage = lazy(() => import("./pages/MallangPage"));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const TrialPage = lazy(() => import("./pages/TrialPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));

// 30초 안에 같은 화면으로 돌아오면 이미 받은 데이터를 바로 보여 준다
const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

function RequireAuth() {
  const { token } = useAuthStore();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  useEffect(() => installButtonRipple(document.getElementById("root")), []);

  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (previous.token && previous.token !== state.token) qc.clear();
  }), []);

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Suspense fallback={<div className="page-loading">불러오는 중…</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<AppNavigationLayout />}>
            <Route element={<RequireAuth />}>
              <Route path="/" element={<RecordLayout />}>
                <Route index element={<MainPage />} />
                <Route path="records/:date" element={<RecordDayPage />} />
              </Route>
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/community" element={<CommunityPage />} />
              <Route path="/prompt" element={<PromptPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/mallang" element={<MallangPage />} />
            </Route>
            <Route path="/about" element={<AboutPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/diary/:date" element={<DiaryEditorPage />} />
          </Route>
          {/* 대시보드 탭은 없앰: 4원천 분석은 메인, 성장·ELO 그래프는 내 정보로 옮김 */}
          <Route path="/dashboard" element={<Navigate to="/profile" replace />} />
          <Route path="/try" element={<TrialPage />} />
        </Routes>
        </Suspense>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              borderRadius: "12px",
              background: "var(--card)",
              color: "var(--text)",
            },
            success: { icon: <Icon name="check" className="toast-success-icon" /> },
            error: { icon: <Icon name="close" className="toast-error-icon" /> },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
