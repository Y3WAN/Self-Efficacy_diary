import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import Icon from "./components/Icon";
import { useAuthStore } from "./store/auth";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import MainPage from "./pages/MainPage";
import RecordDayPage from "./pages/RecordDayPage";
import RecordLayout from "./components/RecordLayout";
import AppNavigationLayout from "./components/AppNavigationLayout";
import DiaryEditorPage from "./pages/DiaryEditorPage";
import ProfilePage from "./pages/ProfilePage";
import CommunityPage from "./pages/CommunityPage";
import PromptPage from "./pages/PromptPage";
import MallangPage from "./pages/MallangPage";
import AnalysisPage from "./pages/AnalysisPage";
import AboutPage from "./pages/AboutPage";
import TrialPage from "./pages/TrialPage";
import { installButtonRipple } from "./utils/buttonRipple";

const qc = new QueryClient();

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
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: { borderRadius: "12px" },
            success: { icon: <Icon name="check" className="toast-success-icon" /> },
            error: { icon: <Icon name="close" className="toast-error-icon" /> },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
