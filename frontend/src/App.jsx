import LeagueSearch from "./components/LeagueSearch";
import "./Search.css";

export default function App() {
  return (
    <main className="search-app">
      <header className="page-header">
        <h1>FanTrade</h1>
        <p>Find fantasy teams and explore their rosters.</p>
      </header>

      {/* This component handles the flow from username to searchable rosters. */}
      <LeagueSearch />
    </main>
  );
}