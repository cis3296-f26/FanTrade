import TradeRosterMoves from "./TradeRosterMoves";

const DEFAULT_AVATAR = "https://sleepercdn.com/images/v2/icons/player_default.webp";

// Keep the result separate so the panel can focus on selections and requests.
export default function TradeSuggestionResult({ result }) {
  // No-match responses have no suggestion, so only read an evaluation if one exists.
  const suggestion = result.suggestion;
  const evaluation = suggestion?.evaluation;

  // Keep actual trade packages separate from the extra cost of required cuts.
  const dropValue = suggestion?.roster_moves?.you?.drop_value || 0;
  const totalCost = (evaluation?.give_total || 0) + dropValue;
  const netGain = suggestion?.net_value_gain ?? evaluation?.difference ?? 0;
  const netPercent = suggestion?.net_advantage_percent ?? evaluation?.diff_percentage;
  const totalSum = totalCost + (evaluation?.receive_total || 0);
  const givePercent = totalSum > 0 ? Math.round((totalCost / totalSum) * 100) : 50;
  const receivePercent = 100 - givePercent;
  const isPositive = netGain >= 0;

  return (
    <section className="trade-suggestion-result" aria-label="Trade suggestion result" aria-live="polite">
      {/* A completed search with no match is different from a failed request. */}
      {result.status === "no_match" ? (
        <div className="suggestion-no-match-box">
          <span className="no-match-pill">{result.search_limited ? "Search limit reached" : "No Match Found"}</span>
          <p className="no-match-message">{result.message}</p>
        </div>
      ) : evaluation ? (
        <>
          {/* Header verdict badge & target upgrade title */}
          <div className="outcome-header-card">
            <div className="outcome-verdict-row">
              <span className={`verdict-pill ${isPositive ? "verdict-win" : "verdict-fair"}`} title="Consensus verdict for the exchanged packages, before roster cuts">
                {evaluation.trade_label || (isPositive ? "Winning Trade" : "Fair Trade")}
              </span>
              {netPercent !== undefined && (
                <span className="advantage-pill">
                  {isPositive ? "+" : ""}{netPercent}% net advantage
                </span>
              )}
            </div>
            <h4 className="outcome-target-heading">
              {suggestion.trade_style === "add_depth" ? "Add depth at" : "Upgrade at"} {suggestion.target_position}
            </h4>
            <p className="trade-result-format">{suggestion.trade_type || `${evaluation.give.length}-for-${evaluation.receive.length}`} · You give {evaluation.give.length}, receive {evaluation.receive.length}</p>
          </div>

          {/* Show both packages vertically with player photos so they fit cleanly in the sidebar. */}
          <div className="outcome-packages-container">
            {[
              {
                label: "You Give",
                packageClass: "give-package",
                players: evaluation.give,
                total: evaluation.give_total,
              },
              {
                label: "You Receive",
                packageClass: "receive-package",
                players: evaluation.receive,
                total: evaluation.receive_total,
              },
            ].map(({ label, packageClass, players, total }, idx) => (
              <div key={label} className="outcome-package-wrapper">
                {idx === 1 && (
                  <div className="package-exchange-divider">
                    <span className="divider-line" />
                    <span className="divider-badge">FOR</span>
                    <span className="divider-line" />
                  </div>
                )}
                <div className={`suggestion-package-card ${packageClass}`}>
                  <div className="package-header-bar">
                    <span className="package-label">{label}</span>
                    <span className="package-total-val">
                      {total.toLocaleString()} <span className="pts-label">pts</span>
                    </span>
                  </div>

                  {/* List each player's photo, identity, and market value within their package. */}
                  <div className="package-player-cards">
                    {players.map((player) => {
                      const avatar =
                        player.avatar_url ||
                        (player.player_id && !isNaN(player.player_id)
                          ? `https://sleepercdn.com/content/nfl/players/thumb/${player.player_id}.jpg`
                          : DEFAULT_AVATAR);

                      return (
                        <div key={player.player_id} className="outcome-player-row">
                          <img
                            src={avatar}
                            alt={player.name}
                            className="outcome-player-avatar"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_AVATAR;
                            }}
                          />
                          <div className="outcome-player-info">
                            <span className="outcome-player-name">{player.name}</span>
                            <div className="outcome-player-meta">
                              <span className={`pos-tag pos-${(player.position || "").toLowerCase()}`}>
                                {player.position}
                              </span>
                              <span className="team-tag">{player.team || "FA"}</span>
                            </div>
                          </div>
                          <div className="outcome-player-value">
                            <span className="value-amt">{player.value?.toLocaleString()}</span>
                            <span className="value-lbl">val</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Visual trade balance meter comparing market value between packages */}
          <div className="trade-balance-card">
            <div className="balance-metrics">
              <span className="metric-give">{dropValue ? "Give + cuts" : "Give"}: {totalCost.toLocaleString()}</span>
              <span className="metric-gain">
                {isPositive ? "+" : ""}{netGain.toLocaleString()} net value
              </span>
              <span className="metric-receive">Get: {evaluation.receive_total.toLocaleString()}</span>
            </div>
            <div className="balance-track">
              <div
                className="balance-fill-give"
                style={{ width: `${givePercent}%` }}
                title={`Your cost: ${givePercent}%`}
              />
              <div
                className="balance-fill-receive"
                style={{ width: `${receivePercent}%` }}
                title={`You Receive: ${receivePercent}%`}
              />
            </div>
          </div>

          <TradeRosterMoves moves={suggestion.roster_moves} />
          {suggestion.your_lineup_value_gain < 0 && (
            <p className="trade-lineup-change">Your projected starting-lineup value decreases by {Math.abs(suggestion.your_lineup_value_gain).toLocaleString()} in this depth trade.</p>
          )}

          {/* Use the backend's verdict and reasons instead of recalculating them here. */}
          <div className="suggestion-reasons-card">
            <span className="reasons-heading">Trade Highlights</span>
            <ul className="suggestion-reasons-list">
              {suggestion.reasons.map((reason) => (
                <li key={reason} className="reason-item">
                  <span className="reason-bullet" aria-hidden="true">•</span>
                  <span className="reason-text">{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Explain the model's limits and credit the source of the player values. */}
          <div className="suggestion-credits-footer">
            <p className="muted method-note">{suggestion.method_note}</p>
            <p className="muted attribution-note">
              Values powered by{" "}
              <a href="https://fantasycalc.com" target="_blank" rel="noopener noreferrer">
                FantasyCalc
              </a>.
            </p>
          </div>
        </>
      ) : (
        <p role="alert">The suggestion was incomplete. Please try again.</p>
      )}

      {/* Keep data gaps and search limits visible even when a trade was found. */}
      {result.warnings?.length > 0 && (
        <ul className="suggestion-warnings">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
