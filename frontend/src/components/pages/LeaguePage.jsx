import Navbar from "../layout/Navbar";
import LeagueSearch from "../league/LeagueSearch";
import useScrollReveal from "../../hooks/useScrollReveal";
import "./LeaguePage.css";

export default function LeaguePage() {
  useScrollReveal();

  return (
    <div className="search-page">
      <Navbar />
      <main className="search-app reveal">
        <LeagueSearch />
      </main>
    </div>
  );
}
