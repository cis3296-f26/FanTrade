import Navbar from "./Navbar";
import "./TradeCalculatorPage.css";

export default function TradeCalculatorPage() {
  return (
    <div className="trade-calc-page">
      <Navbar />
      <main className="trade-calc-main">
        <div className="trade-calc-badge">Under Construction</div>
        <h1 className="trade-calc-title">Trade Calculator</h1>
        <p className="trade-calc-body">
          Data-backed trade analysis is on the way. Check back soon.
        </p>
      </main>
    </div>
  );
}
