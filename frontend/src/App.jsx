import { useState } from "react";
import LeagueSearch from "./components/LeagueSearch";
import TradeEvaluation from "./components/TradeEvaluation";
import "./Search.css";

export default function App() {
  const [showTradeEvaluation, setShowTradeEvaluation] = useState(false);

  return (
    <main className="search-app">
      <header className="page-header">
        <h1>FanTrade</h1>
        <p>Find fantasy teams and explore their rosters.</p>
      </header>

      {/* This component handles the flow from username to searchable rosters. */}
      <LeagueSearch />

      {/* This component handles the trade evaluation flow. */}
      <button
      type="button"
      onClick={() => setShowTradeEvaluation((current) => !current)}
      aria-expanded={showTradeEvaluation}
      aria-controls="trade-evaluation"
      >
        {showTradeEvaluation ? "Close Trade Evaluation" : "Trade Evaluation"}
      </button>

      <div id="trade-evaluation" hidden={!showTradeEvaluation}>
        <TradeEvaluation />
      </div>
    </main>
  );
}