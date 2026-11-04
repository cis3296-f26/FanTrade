import { useState } from "react";
import Navbar from "../layout/Navbar";
import LeagueSearch from "../league/LeagueSearch";
import TradeEvaluation from "../league/TradeEvaluation";
import useScrollReveal from "../../hooks/useScrollReveal";
import "./LeaguePage.css";

export default function LeaguePage() {
  const [showTradeEvaluation, setShowTradeEvaluation] = useState(false);
  useScrollReveal();

  return (
    <div className="search-page">
      <Navbar />
      <main className="search-app reveal">
        <LeagueSearch />
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
    </div>
  );
}
