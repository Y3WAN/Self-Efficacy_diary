import axios from "axios";
import { useAuthStore } from "../store/auth";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const token = useAuthStore.getState().token;
    if (err.response?.status === 401 && token &&
        err.config?.headers?.get?.("Authorization") === `Bearer ${token}`) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(err);
  }
);

export default client;
