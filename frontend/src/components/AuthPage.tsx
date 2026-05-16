import { useState } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const res = mode === "login"
        ? await api.login(email, password)
        : await api.signup(email, password);
      setAuth(res.token, res.user_id, res.email);
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#0b0e14] text-gray-200">
      <div className="w-80 p-6 bg-[#131722] border border-[#1e222d] rounded">
        <h1 className="text-xl font-semibold mb-1">Paper Trading</h1>
        <p className="text-xs text-gray-500 mb-4">
          {mode === "login" ? "Sign in to your account" : "Create a new account"}
        </p>

        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full mb-2 bg-[#1e222d] px-3 py-2 rounded text-sm"
        />
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6 chars)"
          className="w-full mb-3 bg-[#1e222d] px-3 py-2 rounded text-sm"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <button
          onClick={submit} disabled={busy || !email || password.length < 6}
          className="w-full py-2 rounded bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "..." : mode === "login" ? "Log In" : "Sign Up"}
        </button>

        {err && <div className="mt-3 text-xs text-red-400">{err}</div>}

        <div className="mt-4 text-xs text-center text-gray-500">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-blue-400 hover:underline"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}