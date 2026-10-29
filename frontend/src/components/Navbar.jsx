import { useNavigate } from "react-router-dom";
import helmet from "../assets/helmet.png";
import "./Navbar.css";

export default function Navbar() {
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => navigate("/")}>
        <img src={helmet} alt="" className="navbar-helmet" aria-hidden="true" />
        <span>fan trade.</span>
      </div>
    </nav>
  );
}
