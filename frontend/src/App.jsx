import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store/auth";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import MainPage from "./pages/MainPage";
import DiaryEditorPage from "./pages/DiaryEditorPage";
import DashboardPage from "./pages/DashboardPage";
import PersonaPage from "./pages/PersonaPage";
import ProfilePage from "./pages/ProfilePage";

const qc = new QueryClient();

function RequireAuth({ children }) {
  const { token } = useAuthStore();
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/" element={<RequireAuth><MainPage /></RequireAuth>} />
          <Route path="/diary/:date" element={<RequireAuth><DiaryEditorPage /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/persona" element={<RequireAuth><PersonaPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        </Routes>
        <Toaster position="bottom-center" toastOptions={{ style: { fontFamily: 'Pretendard, sans-serif', borderRadius: '12px' } }} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
