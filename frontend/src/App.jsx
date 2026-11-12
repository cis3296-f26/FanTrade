import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./components/pages/HomePage";
import AboutPage from "./components/pages/AboutPage";
import TradeCalculatorPage from "./components/pages/TradeCalculatorPage";
import LeaguePage from "./components/pages/LeaguePage";
import AvailablePlayersPage from "./components/pages/AvailablePlayersPage";
import TargetMapPage from "./components/pages/TargetMapPage";
import PlaygroundPage from "./components/pages/PlaygroundPage";
import GameSimPage from "./components/pages/GameSimPage";

import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";

import { AuthProvider } from "./lib/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<LeaguePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/trade" element={<TradeCalculatorPage />} />
          <Route path="/available-players" element={<AvailablePlayersPage />} />
          <Route path="/playground" element={<PlaygroundPage />}>
            <Route index element={<Navigate to="game-sim" replace />} />
            <Route path="game-sim" element={<GameSimPage />} />
            <Route path="target-map" element={<TargetMapPage />} />
          </Route>
        </Routes>

        <Footer />
      </BrowserRouter>
    </AuthProvider>
  );
}
