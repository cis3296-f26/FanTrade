import { BrowserRouter, Routes, Route } from "react-router-dom";
import LeagueSearch from "./components/LeagueSearch";
import HomePage from "./components/HomePage";
import Navbar from "./components/Navbar";
import "./Search.css";

function SearchPage() {
  return (
    <div className="search-page">
      <Navbar />
      <main className="search-app">
        <LeagueSearch />
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
