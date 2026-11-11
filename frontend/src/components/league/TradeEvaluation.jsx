import { useEffect, useState } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { fetchJson } from "../../lib/api";
import Select, { SelectItem } from "../ui/Select";
import "./TradeEvaluation.css";

function PlayerPicker({
  side,
  label,
  selected,
  excluded,
  popularPlayers,
  settings,
  onAdd,
  onRemove,
  disabled,
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isDynasty = settings?.isDynasty;
  const numQbs = settings?.numQbs ?? 1;
  const numTeams = settings?.numTeams ?? 12;
  const ppr = settings?.ppr ?? 1.0;

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
        const params = new URLSearchParams({
          q: query.trim(),
          isDynasty: isDynasty ? "true" : "false",
          numQbs: String(numQbs),
          numTeams: String(numTeams),
          ppr: String(ppr),
        });

        const data = await fetchJson(
          `/api/trade-evaluation/players?${params.toString()}`,
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
  }, [query, isDynasty, numQbs, numTeams, ppr]);

  const available = matches.filter(
    (player) => !excluded.includes(player.player_id)
  );

  return (
    <div className="trade-side-panel">
      <div className="trade-side-header">
        <h3>{label || side}</h3>
        <span className="trade-count-badge">
          {selected.length} player{selected.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="trade-search-field">
        <label htmlFor={`search-${side}`} className="trade-sr">
          Search player to add to {label || side}
        </label>
        <input
          id={`search-${side}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search player to add…"
          disabled={disabled}
        />
      </div>

      {/* Quick-add popular trade targets */}
      {popularPlayers && popularPlayers.length > 0 && query.trim().length < 2 && (
        <div className="trade-quick-section">
          <span className="quick-label">Top Targets:</span>
          <div className="quick-chip-list">
            {popularPlayers.slice(0, 6).map((player) => {
              const isExcluded = excluded.includes(player.player_id);
              return (
                <button
                  key={player.player_id}
                  type="button"
                  className="btn-quick-chip"
                  disabled={disabled || isExcluded || selected.length >= 10}
                  onClick={() => onAdd(player)}
                  title={isExcluded ? "Already in trade" : `Add ${player.name}`}
                >
                  <span className="chip-name">{player.name}</span>
                  <span className="chip-pos">{player.position}</span>
                  {player.value > 0 && (
                    <span className="chip-val">{player.value.toLocaleString()}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading && <p className="muted" role="status">Searching players…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}

      {!loading && query.trim().length >= 2 && !error && available.length === 0 && (
        <p className="muted">No matching players found.</p>
      )}

      {available.length > 0 && (
        <ul className="trade-match-list">
          {available.map((player) => (
            <li key={player.player_id} className="trade-player-row">
              <div className="player-left">
                <span className="pos-badge">{player.position || "FLEX"}</span>
                <div className="player-details">
                  <span className="player-name">{player.name}</span>
                  <span className="player-meta">{player.team || "FA"}</span>
                </div>
              </div>

              <div className="player-right-group">
                {player.value > 0 && (
                  <span className="player-val-pill">
                    {player.value.toLocaleString()} pts
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={disabled || selected.length >= 10}
                  onClick={() => {
                    onAdd(player);
                    setQuery("");
                    setMatches([]);
                  }}
                >
                  + Add
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="trade-selected-container">
        {selected.length === 0 ? (
          <div className="empty-message">No players selected for this side.</div>
        ) : (
          <ul className="trade-selected-list">
            {selected.map((player) => (
              <li key={player.player_id} className="trade-player-row">
                <div className="player-left">
                  <span className="pos-badge">{player.position || "FLEX"}</span>
                  <div className="player-details">
                    <span className="player-name">{player.name}</span>
                    <span className="player-meta">{player.team || "FA"}</span>
                  </div>
                </div>

                <div className="player-right-group">
                  {player.value > 0 && (
                    <span className="player-val-pill">
                      {player.value.toLocaleString()} pts
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger btn-xs"
                    disabled={disabled}
                    onClick={() => onRemove(player.player_id)}
                    title={`Remove ${player.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const SCORING_METRIC_LABELS = {
  targets: "Targets/game",
  red_zone_opportunities: "Red-zone opportunities/game",
  snap_share: "Offensive snap share",
  carries: "Carries/game",
  attempts: "Pass attempts/game",
  fg_att: "Field goal attempts/game",
  pat_att: "Extra point attempts/game",
  dropbacks: "Opponent dropbacks/game",
  receiving_yards_per_targets: "Receiving yards/target",
  receptions_per_targets: "Catch rate",
  rushing_yards_per_carries: "Rushing yards/carry",
  passing_yards_per_attempts: "Passing yards/attempt",
  fg_made_per_fg_att: "Field goal percentage",
  sacks_per_dropbacks: "Sacks per opponent dropback",
  takeaways_per_dropbacks: "Takeaways per opponent dropback",
};

const PERCENT_METRICS = new Set([
  "snap_share",
  "receptions_per_targets",
  "fg_made_per_fg_att",
  "sacks_per_dropbacks",
  "takeaways_per_dropbacks",
]);

function formatScoringMetric(metric, value) {
  return PERCENT_METRICS.has(metric)
    ? `${(value * 100).toFixed(1)}%`
    : value.toFixed(2);
}

function ExperimentalScoringDetails({ details }) {
  if (!details) return null;

  return (
    <details>
      <summary>Show scoring details</summary>
      {[
        ["Usage", details.usage],
        ["Efficiency", details.efficiency],
      ].map(([label, metrics]) => (
        <div key={label}>
          <strong>{label}</strong>
          {metrics.length ? (
            <ul>
              {metrics.map(({ metric, actual, benchmark, adjustment }) => (
                <li key={metric}>
                  {SCORING_METRIC_LABELS[metric] ?? metric}
                  {" · "}{formatScoringMetric(metric, actual)}
                  {" · benchmark "}{formatScoringMetric(metric, benchmark)}
                  {" · "}{adjustment >= 0 ? "+" : ""}{adjustment.toFixed(2)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No scoring inputs available.</p>
          )}
        </div>
      ))}
    </details>
  );
}

export default function TradeEvaluation() {
  const currentYear = new Date().getFullYear();

  // Mode: "fancalc" (standard consensus) or "experimental" (Luke's nflverse model)
  const [calcMode, setCalcMode] = useState("fancalc");

  // Popular players quick options
  const [popularPlayers, setPopularPlayers] = useState([]);

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

  // Load top popular players matching selected settings
  useEffect(() => {
    if (calcMode !== "fancalc") return;

    const params = new URLSearchParams({
      popular: "true",
      isDynasty: isDynasty ? "true" : "false",
      numQbs: String(numQbs),
      numTeams: String(numTeams),
      ppr: String(ppr),
    });

    fetchJson(`/api/trade-evaluation/players?${params.toString()}`)
      .then((data) => {
        if (Array.isArray(data)) {
          setPopularPlayers(data);
        }
      })
      .catch(() => {});
  }, [calcMode, isDynasty, numQbs, numTeams, ppr]);

  // Keep already-selected player cards in sync with updated settings
  useEffect(() => {
    if (calcMode !== "fancalc") return;
    const allIds = [...give, ...receive].map((p) => p.player_id);
    if (allIds.length === 0) return;

    const params = new URLSearchParams({
      ids: allIds.join(","),
      isDynasty: isDynasty ? "true" : "false",
      numQbs: String(numQbs),
      numTeams: String(numTeams),
      ppr: String(ppr),
    });

    fetchJson(`/api/trade-evaluation/players?${params.toString()}`)
      .then((updatedList) => {
        if (!Array.isArray(updatedList) || updatedList.length === 0) return;
        const map = new Map(updatedList.map((p) => [p.player_id, p]));

        setGive((prev) =>
          prev.map((player) => {
            const updated = map.get(player.player_id);
            return updated && updated.value !== undefined
              ? { ...player, ...updated }
              : player;
          })
        );

        setReceive((prev) =>
          prev.map((player) => {
            const updated = map.get(player.player_id);
            return updated && updated.value !== undefined
              ? { ...player, ...updated }
              : player;
          })
        );
      })
      .catch(() => {});
  }, [calcMode, isDynasty, numQbs, numTeams, ppr]);

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
    <div className="trade-app">
      <h1 className="trade-title page-title">Trade Calculator</h1>
      <p className="trade-description">
        Evaluate trades with real-market consensus player values, or test experimental stats-based models.
      </p>

      {/* Mode Toggle */}
      <ToggleGroup.Root
        type="single"
        value={calcMode}
        onValueChange={(val) => { if (val) { setCalcMode(val); clearResult(); } }}
        className="trade-mode-toggle"
        aria-label="Calculation Mode"
      >
        <div
          className="toggle-slider"
          style={{ transform: calcMode === "experimental" ? "translateX(100%)" : "translateX(0)" }}
        />
        <ToggleGroup.Item value="fancalc" className={`toggle-option ${calcMode === "fancalc" ? "active" : ""}`}>
          FanCalc Consensus <span className="tag-recommended">Standard</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="experimental" className={`toggle-option ${calcMode === "experimental" ? "active" : ""}`}>
          Experimental (NFL Stats) <span className="tag-beta">Beta</span>
        </ToggleGroup.Item>
      </ToggleGroup.Root>

      <form onSubmit={evaluate} className="trade-form">
        {/* Settings Bar */}
        <div className="trade-settings-grid">
          {calcMode === "fancalc" ? (
            <>
              <div className="field">
                <label htmlFor="select-league-format">League Format</label>
                <Select
                  id="select-league-format"
                  value={isDynasty ? "dynasty" : "redraft"}
                  disabled={loading}
                  onChange={(v) => { setIsDynasty(v === "dynasty"); clearResult(); }}
                >
                  <SelectItem value="redraft">Redraft</SelectItem>
                  <SelectItem value="dynasty">Dynasty</SelectItem>
                </Select>
              </div>

              <div className="field">
                <label htmlFor="select-ppr">Scoring</label>
                <Select
                  id="select-ppr"
                  value={String(ppr)}
                  disabled={loading}
                  onChange={(v) => { setPpr(Number(v)); clearResult(); }}
                >
                  <SelectItem value={1}>1.0 PPR</SelectItem>
                  <SelectItem value={0.5}>0.5 Half-PPR</SelectItem>
                  <SelectItem value={0}>0.0 Standard</SelectItem>
                </Select>
              </div>

              <div className="field">
                <label htmlFor="select-qbs">Quarterbacks</label>
                <Select
                  id="select-qbs"
                  value={String(numQbs)}
                  disabled={loading}
                  onChange={(v) => { setNumQbs(Number(v)); clearResult(); }}
                >
                  <SelectItem value={1}>1 QB</SelectItem>
                  <SelectItem value={2}>2 QB / Superflex</SelectItem>
                </Select>
              </div>

              <div className="field">
                <label htmlFor="select-teams">League Size</label>
                <Select
                  id="select-teams"
                  value={String(numTeams)}
                  disabled={loading}
                  onChange={(v) => { setNumTeams(Number(v)); clearResult(); }}
                >
                  <SelectItem value={8}>8 Teams</SelectItem>
                  <SelectItem value={10}>10 Teams</SelectItem>
                  <SelectItem value={12}>12 Teams</SelectItem>
                  <SelectItem value={14}>14 Teams</SelectItem>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="select-season">Season</label>
                <Select
                  id="select-season"
                  value={String(season)}
                  disabled={loading}
                  onChange={(v) => { setSeason(Number(v)); clearResult(); }}
                >
                  {Array.from(
                    { length: currentYear - 1998 },
                    (_, index) => currentYear - index
                  ).map((seasonYear) => (
                    <SelectItem key={seasonYear} value={seasonYear}>{seasonYear}</SelectItem>
                  ))}
                </Select>
              </div>

              <div className="field">
                <label htmlFor="select-exp-ppr">Scoring</label>
                <Select
                  id="select-exp-ppr"
                  value={String(ppr)}
                  disabled={loading}
                  onChange={(v) => { setPpr(Number(v)); clearResult(); }}
                >
                  <SelectItem value={1}>Full PPR</SelectItem>
                  <SelectItem value={0.5}>Half PPR</SelectItem>
                  <SelectItem value={0}>Standard</SelectItem>
                </Select>
              </div>
            </>
          )}
        </div>

        {calcMode === "experimental" && (
          <div className="experimental-banner">
            <strong>Experimental Mode:</strong> Takes into consideration player potential such as snap percentage, target share, and other advanced metrics. Efficiency is the biggest metric.
          </div>
        )}

        {/* Side Selection Columns */}
        <div className="trade-columns">
          <PlayerPicker
            side="give"
            label="I Give"
            selected={give}
            excluded={excluded}
            popularPlayers={popularPlayers}
            settings={{ isDynasty, numQbs, numTeams, ppr }}
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
            popularPlayers={popularPlayers}
            settings={{ isDynasty, numQbs, numTeams, ppr }}
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

        {/* Evaluate Action */}
        <div className="trade-action-row">
          <button
            type="submit"
            className="btn btn-primary btn-lg trade-submit-button"
            disabled={loading || give.length === 0 || receive.length === 0}
          >
            {loading ? "Evaluating Trade…" : "Evaluate Trade"}
          </button>
        </div>
      </form>

      {error && <div className="error-message" role="alert">{error}</div>}

      {/* FanCalc Result Display */}
      {result && result.mode === "fancalc" && (
        <div className="trade-result-section" role="status">
          <div className={`trade-verdict-banner verdict-${(result.favors || "even").toLowerCase()}`}>
            <span className="verdict-tag">
              {result.favors === "Even" ? "Fair Deal" : result.favors === "Receive" ? "Winning Trade" : "Losing Trade"}
            </span>
            <h2 className="verdict-title">{result.verdict}</h2>
          </div>

          <div className="trade-summary-cards">
            <div className="summary-card">
              <span className="summary-card-label">You Give</span>
              <span className="summary-card-val">{result.give_total.toLocaleString()} pts</span>
            </div>

            <div className="summary-card">
              <span className="summary-card-label">You Receive</span>
              <span className="summary-card-val">{result.receive_total.toLocaleString()} pts</span>
            </div>

            <div className="summary-card">
              <span className="summary-card-label">Net Difference</span>
              <span className={`summary-card-val ${result.difference >= 0 ? "text-win" : "text-loss"}`}>
                {result.difference > 0 ? "+" : ""}
                {result.difference.toLocaleString()} pts
                <span className="summary-pct">
                  ({result.diff_percentage > 0 ? "+" : ""}{result.diff_percentage}%)
                </span>
              </span>
            </div>
          </div>

          <div className="trade-table-container">
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
                        <span className={`side-badge side-${sideName.toLowerCase()}`}>
                          {sideName}
                        </span>
                      </td>
                      <td className="player-table-name">{player.name}</td>
                      <td><span className="pos-badge">{player.position}</span></td>
                      <td>{player.team}</td>
                      <td className="player-table-value">{player.value.toLocaleString()}</td>
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
            <p className="trade-attribution-text">
              {result.attribution}:{" "}
              <a
                href={result.attribution_url || "https://fantasycalc.com"}
                target="_blank"
                rel="noopener noreferrer"
              >
                fantasycalc.com →
              </a>
            </p>
          )}
        </div>
      )}

      {/* Experimental Result Display */}
{result && result.mode === "experimental" && (
  <div className="trade-result-section" role="status">
    <div className="trade-verdict-banner verdict-even">
      <span className="verdict-tag">Experimental Model</span>
      <h2 className="verdict-title">{result.verdict}</h2>
    </div>

    <div className="trade-summary-cards">
      <div className="summary-card">
        <span className="summary-card-label">Give score</span>
        <span className="summary-card-val">
          {result.give_total.toFixed(2)}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-card-label">Receive score</span>
        <span className="summary-card-val">
          {result.receive_total.toFixed(2)}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-card-label">Difference</span>
        <span className="summary-card-val">
          {result.difference > 0 ? "+" : ""}
          {result.difference.toFixed(2)}
        </span>
      </div>
    </div>

    <div className="trade-table-container">
      <table className="trade-table">
        <thead>
          <tr>
            <th>Side</th>
            <th>Player</th>
            <th>Games</th>
            <th>Fantasy pts/g</th>
            <th>Usage adjustment</th>
            <th>Efficiency adjustment</th>
            <th>Experimental score</th>
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
                  <span className={`side-badge side-${sideName.toLowerCase()}`}>
                    {sideName}
                  </span>
                </td>
                <td className="player-table-name">
                  {player.name} ({player.position === "DEF" ? "D/ST" : player.position})
                </td>
                <td>{player.games}</td>
                <td>{player.baseline.toFixed(2)}</td>
                <td>
                  {player.usage_adjustment > 0 ? "+" : ""}
                  {player.usage_adjustment.toFixed(2)}
                </td>
                <td>
                  {player.efficiency_adjustment > 0 ? "+" : ""}
                  {player.efficiency_adjustment.toFixed(2)}
                </td>
                  <td className="player-table-name">
                    {player.name} ({player.position === "DEF" ? "D/ST" : player.position})
                    <ExperimentalScoringDetails details={player.scoring_details} />
                  </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

          <p className="muted">
            Experimental scoring incorporates fantasy points per game, including PPR setting. The model then adds or subtracts points based on each player’s workload and efficiency. For wide receivers, workload includes targets per game, red-zone opportunities, and snap share. Efficiency uses yards per target and catch rate, with more weight on yards per target and smaller adjustments when a player has few targets. Benchmark is 2025 league avg.
          </p>
        </div>
      )}
    </div>
  );
}
