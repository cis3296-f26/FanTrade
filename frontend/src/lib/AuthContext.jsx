import { createContext, useContext, useEffect, useState } from "react";
import { fetchJson } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [savedLeagues, setSavedLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  function applyAccount(account) {
    setUser(account.user);
    setSavedLeagues(account.saved_leagues ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccount() {
      try {
        const account = await fetchJson("/api/auth/me", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          applyAccount(account);
          setAuthError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAuthError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadAccount();
    return () => controller.abort();
  }, []);

  async function register(username, password) {
    const account = await fetchJson("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    applyAccount(account);
    setAuthError("");
  }

  async function login(username, password) {
    const account = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    applyAccount(account);
    setAuthError("");
  }

  async function logout() {
    await fetchJson("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSavedLeagues([]);
    setAuthError("");
  }

  async function updateSavedLeague(method, league) {
    const account = await fetchJson("/api/users/me/leagues", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(league),
    });
    applyAccount(account);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        savedLeagues,
        loading,
        authError,
        register,
        login,
        logout,
        updateSavedLeague,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}