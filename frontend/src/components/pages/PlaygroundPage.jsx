import { useNavigate, useLocation, Outlet } from "react-router-dom";
import "./PlaygroundPage.css";

const TABS = [
  { label: "Game Sim", path: "/playground/game-sim" },
  { label: "Target Map", path: "/playground/target-map" },
];

export default function PlaygroundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="playground-page">
      <div className="playground-header">
        <h1 className="page-title">Playground</h1>
        <p className="playground-description">
          Explore interactive simulations and analysis tools for fantasy football.
        </p>
        <div className="playground-toggle-bar">
          {TABS.map(({ label, path }) => (
            <button
              key={path}
              className={`playground-tab${pathname === path ? " playground-tab--active" : ""}`}
              onClick={() => navigate(path)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
