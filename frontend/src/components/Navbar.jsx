import { useState } from "react";
import { useNavigate } from "react-router-dom";
import helmet from "../assets/helmet.png";
import { useAuth } from "../lib/AuthContext";
import "./Navbar.css";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, loading, authError, register, login, logout } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "register") {
        await register(username, password);
      } else {
        await login(username, password);
      }
      setUsername("");
      setPassword("");
      setPanelOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await logout();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => navigate("/")}>
        <img src={helmet} alt="" className="navbar-helmet" aria-hidden="true" />
        <span>fan trade.</span>
      </div>

      <div className="navbar-account">
        {user ? (
          <>
            <span className="navbar-username">Signed in as {user.username}</span>
            <button type="button" className="navbar-account-button" onClick={handleLogout}>
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            className="navbar-account-button"
            aria-expanded={panelOpen}
            aria-controls="account-panel"
            onClick={() => {
              setPanelOpen((open) => !open);
              setError("");
            }}
          >
            {loading ? "Sign in" : "Sign in / Register"}
          </button>
        )}

        {panelOpen && !user && (
          <form id="account-panel" className="account-panel" onSubmit={handleSubmit}>
            <h2>{mode === "register" ? "Create an account" : "Sign in"}</h2>
            <label htmlFor="account-username">Username</label>
            <input
              id="account-username"
              autoComplete="username"
              minLength={3}
              maxLength={32}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <label htmlFor="account-password">Password</label>
            <input
              id="account-password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {(error || authError) && (
              <p className="account-error" role="alert">
                {error || authError}
              </p>
            )}
            <button type="submit" disabled={busy}>
              {busy
                ? "Please wait..."
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}
            </button>
            <button
              type="button"
              className="account-mode-button"
              onClick={() => {
                setMode((current) => (current === "register" ? "login" : "register"));
                setError("");
              }}
            >
              {mode === "register"
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </button>
          </form>
        )}

        {user && error && (
          <p className="account-error navbar-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </nav>
  );
}