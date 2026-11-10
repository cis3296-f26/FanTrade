import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import { useAuth } from "../../lib/AuthContext";
import helmet from "../../assets/helmet.png";
import "./Navbar.css";

const NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "League View", path: "/search" },
  { label: "Trade Calculator", path: "/trade" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const { user, loading, authError, register, login, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  function handleNav(path) {
    navigate(path);
    setOpen(false);
  }

  function handleAccountOpenChange(next) {
    setAccountOpen(next);
    if (!next) setAccountError("");
  }

  async function handleAccountSubmit(event) {
    event.preventDefault();
    setAccountBusy(true);
    setAccountError("");

    try {
      if (accountMode === "register") {
        await register(username, password);
      } else {
        await login(username, password);
      }
      setUsername("");
      setPassword("");
      setAccountOpen(false);
    } catch (requestError) {
      setAccountError(requestError.message);
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleLogout() {
    setAccountError("");
    try {
      await logout();
    } catch (requestError) {
      setAccountError(requestError.message);
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => handleNav("/")}>
        <img src={helmet} alt="" className="navbar-helmet" aria-hidden="true" />
        <span>FanTrade.</span>
      </div>

      <button
        className="navbar-hamburger"
        aria-label="Toggle menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`navbar-hamburger-icon${open ? " navbar-hamburger-icon--open" : ""}`} />
      </button>

      <ul className={`navbar-links${open ? " navbar-links--open" : ""}`}>
        {NAV_LINKS.map(({ label, path }) => (
          <li key={path}>
            <button
              className={`navbar-link${pathname === path ? " navbar-link--active" : ""}`}
              onClick={() => handleNav(path)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      <div className="navbar-account">
        {user ? (
          <>
            <span className="navbar-username">Signed in as {user.username}</span>
            <button
              type="button"
              className="btn btn-ghost navbar-account-button"
              onClick={handleLogout}
              disabled={loading}
            >
              Sign out
            </button>
            {accountError && (
              <p className="navbar-account-error navbar-account-error--signed-in" role="alert">
                {accountError}
              </p>
            )}
          </>
        ) : (
          <Popover.Root open={accountOpen} onOpenChange={handleAccountOpenChange}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="btn btn-ghost navbar-account-button"
              >
                {loading ? "Sign in" : "Sign in / Register"}
              </button>
            </Popover.Trigger>

            <Popover.Portal>
              <Popover.Content
                className="navbar-account-panel"
                align="end"
                sideOffset={12}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <form onSubmit={handleAccountSubmit}>
                  <h2>{accountMode === "register" ? "Create an account" : "Sign in"}</h2>

                  <label htmlFor="navbar-account-username">Username</label>
                  <input
                    id="navbar-account-username"
                    autoComplete="username"
                    minLength={3}
                    maxLength={32}
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />

                  <label htmlFor="navbar-account-password">Password</label>
                  <input
                    id="navbar-account-password"
                    type="password"
                    autoComplete={accountMode === "register" ? "new-password" : "current-password"}
                    minLength={8}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />

                  {(accountError || authError) && (
                    <p className="navbar-account-error" role="alert">
                      {accountError || authError}
                    </p>
                  )}

                  <button type="submit" className="btn btn-primary btn-md" disabled={accountBusy}>
                    {accountBusy
                      ? "Please wait..."
                      : accountMode === "register"
                        ? "Create account"
                        : "Sign in"}
                  </button>

                  <button
                    type="button"
                    className="navbar-account-mode-button"
                    onClick={() => {
                      setAccountMode((mode) => (mode === "register" ? "login" : "register"));
                      setAccountError("");
                    }}
                  >
                    {accountMode === "register"
                      ? "Already have an account? Sign in"
                      : "New here? Create an account"}
                  </button>
                </form>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </nav>
  );
}
