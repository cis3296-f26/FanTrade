import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./components/pages/HomePage";
import AboutPage from "./components/pages/AboutPage";
import TradeCalculatorPage from "./components/pages/TradeCalculatorPage";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import LeagueSearch from "./components/league/LeagueSearch";
import TradeEvaluation from "./components/league/TradeEvaluation";
import "./components/pages/LeaguePage.css";

function LeaguePage() {
  const [showTradeEvaluation, setShowTradeEvaluation] = useState(false);

  return (
    <div className="search-page">
      <Navbar />
      <main className="search-app">
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<LeaguePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/trade" element={<TradeCalculatorPage />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
