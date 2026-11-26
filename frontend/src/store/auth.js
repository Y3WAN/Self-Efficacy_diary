import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create((set, get, store) =>
  persist(
    (setPersisted) => ({
      token: null,
      user: null,
      setToken: (token) => setPersisted({ token }),
      setUser: (user) => setPersisted({ user }),
      logout: () => {
        // 저장 세션 삭제가 실패하면 현재 로그인 상태를 유지해 재시도할 수 있게 한다.
        store.persist?.clearStorage();
        set({ token: null, user: null });
      },
    }),
    { name: "auth" },
  )(set, get, store)
);
