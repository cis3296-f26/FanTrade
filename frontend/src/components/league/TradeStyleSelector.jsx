import { useRef, useState } from "react";

const STYLES = [
  ["any", "Any"],
  ["trade_up", "Trade up"],
  ["trade_up_or_balanced", "Trade up or balanced"],
  ["balanced", "Balanced"],
  ["add_depth", "Add depth"],
  ["add_depth_or_balanced", "Add depth or balanced"],
];

// Native radio choices keep the six combinations mutually exclusive and keyboard accessible.
export default function TradeStyleSelector({ value, onChange, disabled }) {
  const dropdown = useRef(null);
  const [showHelp, setShowHelp] = useState(false);
  const label = STYLES.find(([key]) => key === value)?.[1] || "Any";

  function closeDropdown() {
    dropdown.current.open = false;
    dropdown.current.querySelector("summary").focus();
    setShowHelp(false);
  }

  return (
    <div className="trade-style-field">
      <span id="trade-style-label" className="trade-control-label">Trade style</span>
      <details
        className="trade-style-dropdown"
        ref={dropdown}
        onKeyDown={(event) => {
          // Escape returns focus to the collapsed control, including from its help text.
          if (event.key === "Escape") {
            event.preventDefault();
            closeDropdown();
          }
        }}
      >
        <summary
          className="select-trigger"
          aria-labelledby="trade-style-label trade-style-value"
          aria-disabled={disabled}
          onClick={(event) => { if (disabled) event.preventDefault(); }}
        >
          <span id="trade-style-value">{label}</span><span aria-hidden="true">▾</span>
        </summary>
        <div className="trade-style-options">
          <fieldset disabled={disabled} aria-labelledby="trade-style-label">
            {STYLES.map(([key, text]) => (
              <label key={key} className="trade-style-option">
                <input
                  type="radio"
                  name="trade-style"
                  value={key}
                  checked={value === key}
                  onChange={() => { onChange(key); closeDropdown(); }}
                />
                {text}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="trade-style-help-button"
            aria-expanded={showHelp}
            aria-controls="trade-style-help"
            onClick={() => setShowHelp((shown) => !shown)}
          >
            What do these options mean?
          </button>
          {/* The same explanation sits beside the options on desktop and in the flow on mobile. */}
          {showHelp && (
            <div id="trade-style-help" className="trade-style-help" role="region" aria-label="Trade style explanations">
              <p><strong>Trade up:</strong> Give more players than you receive, such as 2 for 1, to upgrade a starting option.</p>
              <p><strong>Balanced:</strong> Exchange the same number of players, such as 1 for 1 or 2 for 2.</p>
              <p><strong>Add depth:</strong> Give fewer players than you receive, such as 1 for 2, to gain more usable players. At least one of two, or two of three, incoming players must fit your projected starting lineup.</p>
              <p><strong>Any:</strong> Consider every format. The combined options include both named styles.</p>
              <button type="button" className="trade-style-help-button" onClick={() => setShowHelp(false)}>Close explanation</button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
