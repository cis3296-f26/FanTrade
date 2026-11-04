import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import helmet from "../../assets/helmet.png";
import "./Navbar.css";

const NAV_LINKS = [
  { label: "League View", path: "/search" },
  { label: "Trade Calculator", path: "/trade" },
  { label: "About", path: "/about" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  function handleNav(path) {
    navigate(path);
    setOpen(false);
  }

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => handleNav("/")}>
        <img src={helmet} alt="" className="navbar-helmet" aria-hidden="true" />
        <span>fantrade.</span>
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
    </nav>
  );
}
