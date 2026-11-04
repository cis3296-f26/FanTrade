import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import "./TradeEvaluation.css";

function PlayerPicker({
  side,
  label,
  selected,
  excluded,
  onAdd,
  onRemove,
  disabled,
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setMatches([]);
    setError("");
    setLoading(false);

    if (query.trim().length < 2) {
      return () => controller.abort();
    }

    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await fetchJson(
          `/api/trade-evaluation/players?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        );

        if (!controller.signal.aborted) {
          setMatches(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const available = matches.filter(
    (player) => !excluded.includes(player.player_id)
  );

  return (
    <section className="trade-side-card" aria-label={label || side}>
      <div className="trade-side-header">
        <h3 className="trade-side-title">{label || side}</h3>
        <span className="trade-side-count">{selected.length} player{selected.length === 1 ? "" : "s"}</span>
      </div>

      <div className="trade-search-field">
        <input
          className="trade-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search players to add to ${side}…`}
          disabled={disabled}
        />
      </div>

      {loading && <p className="trade-status-hint" role="status">Searching players…</p>}
      {error && <p className="trade-error-hint" role="alert">{error}</p>}

      {!loading && query.trim().length >= 2 && !error && available.length === 0 && (
        <p className="trade-status-hint">No matching players found.</p>
      )}

      {available.length > 0 && (
        <ul className="trade-match-list">
          {available.map((player) => (
            <li key={player.player_id} className="trade-match-item">
              <div className="trade-player-meta">
                <span className="trade-player-name">{player.name}</span>
                <span className="trade-player-tag">
                  {player.position || "FLEX"} · {player.team || "FA"}
                </span>
              </div>

              <button
                type="button"
                className="trade-btn-add"
                disabled={disabled || selected.length >= 8}
                onClick={() => {
                  onAdd(player);
                  setQuery("");
                  setMatches([]);
                }}
              >
                + Add
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="trade-selected-container">
        {selected.length === 0 ? (
          <p className="trade-empty-hint">No players selected for this side yet.</p>
        ) : (
          <ul className="trade-selected-list">
            {selected.map((player) => (
              <li key={player.player_id} className="trade-selected-item">
                <div className="trade-player-meta">
                  <span className="trade-player-name">{player.name}</span>
                  <span className="trade-player-tag">
                    {player.position || "FLEX"} · {player.team || "FA"}
                  </span>
                </div>

                <button
                  type="button"
                  className="trade-btn-remove"
                  disabled={disabled}
                  onClick={() => onRemove(player.player_id)}
                  title={`Remove ${player.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function TradeEvaluation() {
  const currentYear = new Date().getFullYear();

  // Mode: "fancalc" (standard consensus) or "experimental" (Luke's nflverse model)
  const [calcMode, setCalcMode] = useState("fancalc");

  // FanCalc Settings
  const [isDynasty, setIsDynasty] = useState(false);
  const [numQbs, setNumQbs] = useState(1);
  const [numTeams, setNumTeams] = useState(12);

  // Shared / Experimental Settings
  const [ppr, setPpr] = useState(1.0);
  const [season, setSeason] = useState(
    new Date().getMonth() >= 8 ? currentYear : currentYear - 1
  );

  // Trade Sides
  const [give, setGive] = useState([]);
  const [receive, setReceive] = useState([]);

  // Result state
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const clearResult = () => {
    setResult(null);
    setError("");
  };

  const excluded = [...give, ...receive].map((player) => player.player_id);

  async function evaluate(event) {
    event.preventDefault();
    clearResult();
    setLoading(true);

    try {
      const payload =
        calcMode === "fancalc"
          ? {
              mode: "fancalc",
              isDynasty,
              numQbs,
              numTeams,
              ppr,
              give: give.map((player) => player.player_id),
              receive: receive.map((player) => player.player_id),
            }
          : {
              mode: "experimental",
              season,
              ppr,
              give: give.map((player) => player.player_id),
              receive: receive.map((player) => player.player_id),
            };

      const data = await fetchJson("/api/trade-evaluation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to evaluate trade.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="trade-evaluator">
      <div className="trade-intro">
        <h2 className="trade-heading">Trade Calculator</h2>
        <p className="trade-subheading">
          Analyze trade values, find fair deals, and see who wins the trade.
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="trade-mode-tabs" role="tablist" aria-label="Trade calculation mode">
        <button
          type="button"
          role="tab"
          aria-selected={calcMode === "fancalc"}
          className={`trade-mode-tab ${calcMode === "fancalc" ? "active" : ""}`}
          onClick={() => {
            setCalcMode("fancalc");
            clearResult();
          }}
        >
          FanCalc Consensus
          <span className="trade-badge-default">Standard</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={calcMode === "experimental"}
          className={`trade-mode-tab ${calcMode === "experimental" ? "active" : ""}`}
          onClick={() => {
            setCalcMode("experimental");
            clearResult();
          }}
        >
          Experimental (NFL Stats)
          <span className="trade-badge-experimental">Beta</span>
        </button>
      </div>

      <form onSubmit={evaluate} className="trade-form">
        {/* Settings Bar */}
        <div className="trade-settings-bar">
          {calcMode === "fancalc" ? (
            <>
              <label className="trade-setting-item">
                <span>League Format</span>
                <select
                  value={isDynasty ? "dynasty" : "redraft"}
                  disabled={loading}
                  onChange={(e) => {
                    setIsDynasty(e.target.value === "dynasty");
                    clearResult();
                  }}
                >
                  <option value="redraft">Redraft</option>
                  <option value="dynasty">Dynasty</option>
                </select>
              </label>

              <label className="trade-setting-item">
                <span>Scoring (PPR)</span>
                <select
                  value={ppr}
                  disabled={loading}
                  onChange={(e) => {
                    setPpr(Number(e.target.value));
                    clearResult();
                  }}
                >
                  <option value={1}>1.0 PPR</option>
                  <option value={0.5}>0.5 Half-PPR</option>
                  <option value={0}>0.0 Standard</option>
                </select>
              </label>

              <label className="trade-setting-item">
                <span>Quarterbacks</span>
                <select
                  value={numQbs}
                  disabled={loading}
                  onChange={(e) => {
                    setNumQbs(Number(e.target.value));
                    clearResult();
                  }}
                >
                  <option value={1}>1 QB</option>
                  <option value={2}>2 QB / Superflex</option>
                </select>
              </label>

              <label className="trade-setting-item">
                <span>Teams</span>
                <select
                  value={numTeams}
                  disabled={loading}
                  onChange={(e) => {
                    setNumTeams(Number(e.target.value));
                    clearResult();
                  }}
                >
                  <option value={8}>8 Teams</option>
                  <option value={10}>10 Teams</option>
                  <option value={12}>12 Teams</option>
                  <option value={14}>14 Teams</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <div className="trade-experimental-banner">
                <strong>Experimental Mode:</strong> Compares regular-season per-game
                averages from NFL play-by-play data. Currently restricted to wide receivers.
              </div>

              <div className="trade-experimental-settings">
                <label className="trade-setting-item">
                  <span>Season</span>
                  <select
                    value={season}
                    disabled={loading}
                    onChange={(event) => {
                      setSeason(Number(event.target.value));
                      clearResult();
                    }}
                  >
                    {Array.from(
                      { length: currentYear - 1998 },
                      (_, index) => currentYear - index
                    ).map((seasonYear) => (
                      <option key={seasonYear}>{seasonYear}</option>
                    ))}
                  </select>
                </label>

                <label className="trade-setting-item">
                  <span>Scoring</span>
                  <select
                    value={ppr}
                    disabled={loading}
                    onChange={(event) => {
                      setPpr(Number(event.target.value));
                      clearResult();
                    }}
                  >
                    <option value={1}>Full PPR</option>
                    <option value={0.5}>Half PPR</option>
                    <option value={0}>Standard</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Side Selection Columns */}
        <div className="trade-columns">
          <PlayerPicker
            side="give"
            label="I Give"
            selected={give}
            excluded={excluded}
            disabled={loading}
            onAdd={(player) => {
              setGive((prev) => [...prev, player]);
              clearResult();
            }}
            onRemove={(id) => {
              setGive((prev) => prev.filter((p) => p.player_id !== id));
              clearResult();
            }}
          />

          <PlayerPicker
            side="receive"
            label="I Receive"
            selected={receive}
            excluded={excluded}
            disabled={loading}
            onAdd={(player) => {
              setReceive((prev) => [...prev, player]);
              clearResult();
            }}
            onRemove={(id) => {
              setReceive((prev) => prev.filter((p) => p.player_id !== id));
              clearResult();
            }}
          />
        </div>

        {/* Action Button */}
        <div className="trade-action-row">
          <button
            type="submit"
            className="trade-submit-btn"
            disabled={loading || give.length === 0 || receive.length === 0}
          >
            {loading ? "Evaluating trade…" : "Evaluate Trade"}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="trade-error-banner">
          {error}
        </div>
      )}

      {/* Result Display */}
      {result && result.mode === "fancalc" && (
        <div className="trade-result-card" role="status">
          <div className={`trade-verdict-header favors-${(result.favors || "even").toLowerCase()}`}>
            <span className="trade-verdict-tag">{result.favors === "Even" ? "Balanced" : result.favors === "Receive" ? "Winning Trade" : "Losing Trade"}</span>
            <h3 className="trade-verdict-title">{result.verdict}</h3>
          </div>

          <div className="trade-summary-grid">
            <div className="trade-summary-box">
              <span className="summary-label">You Give</span>
              <span className="summary-val">{result.give_total.toLocaleString()} pts</span>
            </div>

            <div className="trade-summary-box">
              <span className="summary-label">You Receive</span>
              <span className="summary-val">{result.receive_total.toLocaleString()} pts</span>
            </div>

            <div className="trade-summary-box">
              <span className="summary-label">Net Difference</span>
              <span className={`summary-val ${result.difference >= 0 ? "positive" : "negative"}`}>
                {result.difference > 0 ? "+" : ""}
                {result.difference.toLocaleString()} pts
                <span className="summary-pct">
                  ({result.diff_percentage > 0 ? "+" : ""}
                  {result.diff_percentage}%)
                </span>
              </span>
            </div>
          </div>

          <div className="trade-table-wrapper">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>Team</th>
                  <th>Trade Value</th>
                  <th>Overall Rank</th>
                  <th>Pos Rank</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Give", result.give],
                  ["Receive", result.receive],
                ].flatMap(([sideName, players]) =>
                  players.map((player) => (
                    <tr key={`${sideName}-${player.player_id}`}>
                      <td>
                        <span className={`side-pill side-${sideName.toLowerCase()}`}>
                          {sideName}
                        </span>
                      </td>
                      <td className="player-col-name">{player.name}</td>
                      <td>{player.position}</td>
                      <td>{player.team}</td>
                      <td className="player-col-value">
                        {player.unranked ? (
                          <span className="unranked-label">Waiver / 0</span>
                        ) : (
                          player.value.toLocaleString()
                        )}
                      </td>
                      <td>{player.overall_rank ? `#${player.overall_rank}` : "—"}</td>
                      <td>
                        {player.position_rank
                          ? `${player.position}${player.position_rank}`
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {result.attribution && (
            <div className="trade-attribution">
              {result.attribution}{" "}
              <a
                href={result.attribution_url || "https://fantasycalc.com"}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit FantasyCalc →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Experimental Result Display */}
      {result && result.mode === "experimental" && (
        <div className="trade-result-card" role="status">
          <div className="trade-verdict-header favors-even">
            <span className="trade-verdict-tag">Experimental Model</span>
            <h3 className="trade-verdict-title">{result.verdict}</h3>
          </div>

          <div className="trade-summary-grid">
            <div className="trade-summary-box">
              <span className="summary-label">Give Avg</span>
              <span className="summary-val">{result.give_total.toFixed(2)} pts/g</span>
            </div>
            <div className="trade-summary-box">
              <span className="summary-label">Receive Avg</span>
              <span className="summary-val">{result.receive_total.toFixed(2)} pts/g</span>
            </div>
            <div className="trade-summary-box">
              <span className="summary-label">Net Difference</span>
              <span className="summary-val">
                {result.difference > 0 ? "+" : ""}
                {result.difference.toFixed(2)} pts/g
              </span>
            </div>
          </div>

          <div className="trade-table-wrapper">
            <table className="trade-table">
              <caption>
                {result.season} · {result.source}
              </caption>
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Player</th>
                  <th>Games</th>
                  <th>Rec/g</th>
                  <th>Rec Yds/g</th>
                  <th>Rec TD/g</th>
                  <th>Pts/game</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Give", result.give],
                  ["Receive", result.receive],
                ].flatMap(([sideName, players]) =>
                  players.map((player) => (
                    <tr key={`${sideName}-${player.player_id}`}>
                      <td>
                        <span className={`side-pill side-${sideName.toLowerCase()}`}>
                          {sideName}
                        </span>
                      </td>
                      <td className="player-col-name">{player.name}</td>
                      <td>{player.games}</td>
                      <td>{player.averages?.receptions?.toFixed(2) ?? "—"}</td>
                      <td>{player.averages?.receiving_yards?.toFixed(2) ?? "—"}</td>
                      <td>{player.averages?.receiving_tds?.toFixed(2) ?? "—"}</td>
                      <td className="player-col-value">{player.value?.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="trade-disclaimer muted">
            Experimental scoring: 0.1/receiving or rushing yd, 6/TD, 0.04/pass yd, 4/pass TD, -2/INT or fumble. Season totals ÷ recorded games. Multi-player totals do not account for roster limits or injury risk.
          </p>
        </div>
      )}
    </section>
  );
}
