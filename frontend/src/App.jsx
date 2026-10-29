import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LeagueSearch from "./components/LeagueSearch";
import HomePage from "./components/HomePage";
import Navbar from "./components/Navbar";
import TradeEvaluation from "./components/TradeEvaluation";
import "./Search.css";

function SearchPage() {
  const [showTradeEvaluation, setShowTradeEvaluation] = useState(false);

  return (
    <div className="search-page">
      <Navbar />
      <main className="search-app">
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
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </BrowserRouter>
  );
}