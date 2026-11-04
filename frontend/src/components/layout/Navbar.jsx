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

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => navigate("/")}>
        <img src={helmet} alt="" className="navbar-helmet" aria-hidden="true" />
        <span>fantrade.</span>
      </div>
      <ul className="navbar-links">
        {NAV_LINKS.map(({ label, path }) => (
          <li key={path}>
            <button
              className={`navbar-link${pathname === path ? " navbar-link--active" : ""}`}
              onClick={() => navigate(path)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
