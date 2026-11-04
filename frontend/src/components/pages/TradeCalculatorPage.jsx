import TradeEvaluation from "../league/TradeEvaluation";
import "./TradeCalculatorPage.css";

export default function TradeCalculatorPage() {
  return (
    <div className="trade-calc-page">
      <main className="trade-calc-main">
        <TradeEvaluation />
      </main>
    </div>
  );
}