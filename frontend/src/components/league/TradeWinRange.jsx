import * as Slider from "@radix-ui/react-slider";

// Display changes immediately; the parent sends requests only when the edit finishes.
export default function TradeWinRange({ value, onChange, onCommit, disabled }) {
  return (
    <div className="trade-win-range">
      <span id="trade-win-label" className="trade-control-label">Your value advantage</span>
      <div className="trade-range-values">
        <span>Minimum <strong>{value[0]}%</strong></span>
        <span>Maximum <strong>{value[1]}%</strong></span>
      </div>
      <Slider.Root
        className="trade-range-slider"
        value={value}
        min={1}
        max={35}
        step={1}
        minStepsBetweenThumbs={8}
        disabled={disabled}
        onValueChange={onChange}
        onValueCommit={onCommit}
        aria-labelledby="trade-win-label"
      >
        <Slider.Track className="trade-range-track">
          <Slider.Range className="trade-range-fill" />
        </Slider.Track>
        <Slider.Thumb className="trade-range-thumb" aria-label="Minimum value advantage" aria-describedby="trade-range-help" />
        <Slider.Thumb className="trade-range-thumb" aria-label="Maximum value advantage" aria-describedby="trade-range-help" />
      </Slider.Root>
      <p id="trade-range-help" className="muted trade-control-help">
        Choose 1%–35%, with at least 8 percentage points between the limits.
        Your required drops count toward the cost.
      </p>
    </div>
  );
}
