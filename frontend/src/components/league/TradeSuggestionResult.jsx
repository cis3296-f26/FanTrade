// Keep the result separate so the panel can focus on selections and requests.
export default function TradeSuggestionResult({ result }) {
  // No-match responses have no suggestion, so only read an evaluation if one exists.
  const suggestion = result.suggestion;
  const evaluation = suggestion?.evaluation;

  return (
    <section className="trade-suggestion-result" aria-label="Trade suggestion result" aria-live="polite">
      {/* A completed search with no match is different from a failed request. */}
      {result.status === "no_match" ? (
        <p>{result.message}</p>
      ) : evaluation ? (
        <>
          <h4>Upgrade at {suggestion.target_position}</h4>
          {/* Show both packages vertically so they fit in the sidebar. */}
          {[["You give", evaluation.give], ["You receive", evaluation.receive]].map(([label, players]) => (
            <div className="suggestion-package" key={label}>
              <h5>{label}</h5>
              {/* List each player's identity and market value within their package. */}
              <ul>
                {players.map((player) => (
                  <li key={player.player_id}>
                    <strong>{player.name}</strong>
                    <span>{player.position} · {player.team} · {player.value.toLocaleString()} value</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {/* These are market values, not projected fantasy points. */}
          <dl className="suggestion-totals">
            <div><dt>Total given</dt><dd>{evaluation.give_total.toLocaleString()}</dd></div>
            <div><dt>Total received</dt><dd>{evaluation.receive_total.toLocaleString()}</dd></div>
            <div><dt>Your advantage</dt><dd>+{evaluation.difference.toLocaleString()} (+{evaluation.diff_percentage}%)</dd></div>
          </dl>
          {/* Use the backend's verdict and reasons instead of recalculating them here. */}
          <p>{evaluation.verdict}</p>
          <ul className="suggestion-reasons">
            {suggestion.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {/* Explain the model's limits and credit the source of the player values. */}
          <p className="muted">{suggestion.method_note}</p>
          <p className="muted">
            Values powered by <a href="https://fantasycalc.com" target="_blank" rel="noopener noreferrer">FantasyCalc</a>.
          </p>
        </>
      ) : <p role="alert">The suggestion was incomplete. Please try again.</p>}

      {/* Keep data gaps and search limits visible even when a trade was found. */}
      {result.warnings?.length > 0 && (
        <ul className="suggestion-warnings">
          {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </section>
  );
}
