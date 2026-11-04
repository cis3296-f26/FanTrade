import Navbar from "../layout/Navbar";
import useScrollReveal from "../../hooks/useScrollReveal";
import "./TradeCalculatorPage.css";

export default function TradeCalculatorPage() {
  useScrollReveal();

  return (
    <div className="trade-calc-page">
      <Navbar />
      <main className="trade-calc-main">
        <div className="trade-calc-badge reveal">Under Construction</div>
        <h1 className="trade-calc-title reveal">Trade Calculator</h1>
        <p className="trade-calc-body reveal">
          Data-backed trade analysis is on the way. Check back soon.
        </p>
      </main>
    </div>
  );
}
