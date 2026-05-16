import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  setToken: (token: string) => void;
  setAuth: (token: string, userId: string, email: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      email: null,
      setToken: (token) => set({ token }),
      setAuth: (token, userId, email) => set({ token, userId, email }),
      logout: () => set({ token: null, userId: null, email: null }),
    }),
    { name: "auth" }
  )
);
