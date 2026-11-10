import useScrollReveal from "../../hooks/useScrollReveal";
import TradeEvaluation from "../league/TradeEvaluation";
import "./TradeCalculatorPage.css";

export default function TradeCalculatorPage() {
  useScrollReveal();

  return (
    <div className="trade-calc-page">
      <main className="trade-calc-main reveal">
        <TradeEvaluation />
      </main>
    </div>
  );
}