"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, usersApi } from "@/lib/api";
import type { User, AuthState } from "@/types";

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => {
        set({ token });
        if (typeof window !== "undefined") {
          if (token) localStorage.setItem("chai_analysis_token", token);
          else localStorage.removeItem("chai_analysis_token");
        }
      },

      login: async (email, password) => {
        const data = await authApi.login(email, password);
        set({ token: data.access_token, isAuthenticated: true });
        if (typeof window !== "undefined") {
          localStorage.setItem("chai_analysis_token", data.access_token);
        }
        const user = await usersApi.me();
        set({ user });
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        if (typeof window !== "undefined") {
          localStorage.removeItem("chai_analysis_token");
          window.location.href = "/login";
        }
      },
    }),
    {
      name: "chai-analysis-auth",
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
