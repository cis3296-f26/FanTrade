import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./components/pages/HomePage";
import AboutPage from "./components/pages/AboutPage";
import TradeCalculatorPage from "./components/pages/TradeCalculatorPage";
import LeaguePage from "./components/pages/LeaguePage";
import Footer from "./components/layout/Footer";

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
