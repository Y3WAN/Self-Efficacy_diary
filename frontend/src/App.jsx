import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store/auth";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import MainPage from "./pages/MainPage";
import DiaryEditorPage from "./pages/DiaryEditorPage";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import FailureLogsPage from "./pages/FailureLogsPage";
import CommunityPage from "./pages/CommunityPage";
import PromptPage from "./pages/PromptPage";
import MallangPage from "./pages/MallangPage";
import AnalysisPage from "./pages/AnalysisPage";
import MissionExperimentPage from "./pages/MissionExperimentPage";
import AboutPage from "./pages/AboutPage";

const qc = new QueryClient();

function RequireAuth({ children }) {
  const { token } = useAuthStore();
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (previous.token && previous.token !== state.token) qc.clear();
  }), []);

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/" element={<RequireAuth><MainPage /></RequireAuth>} />
          <Route path="/diary/:date" element={<RequireAuth><DiaryEditorPage /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/mission-experiment" element={<RequireAuth><MissionExperimentPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/failure-logs" element={<RequireAuth><FailureLogsPage /></RequireAuth>} />
          <Route path="/community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
          <Route path="/prompt" element={<RequireAuth><PromptPage /></RequireAuth>} />
          <Route path="/analysis" element={<RequireAuth><AnalysisPage /></RequireAuth>} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/mallang" element={<RequireAuth><MallangPage /></RequireAuth>} />
        </Routes>
        <Toaster position="bottom-center" toastOptions={{ style: { fontFamily: 'Pretendard, sans-serif', borderRadius: '12px' } }} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
