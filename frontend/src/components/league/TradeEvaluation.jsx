import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import "./TradeEvaluation.css";

function PlayerPicker({
  side,
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
    <section className="trade-side" aria-label={side}>
      <h3>{side} ({selected.length})</h3>

      <label>
        Search {side}:
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search player name…"
          disabled={disabled}
        />
      </label>

      {loading && <p role="status">Searching players…</p>}
      {error && <p role="alert">{error}</p>}

      {!loading && query.trim().length >= 2 && !error && available.length === 0 && (
        <p>No available matches.</p>
      )}

      {available.length > 0 && (
        <ul className="trade-matches">
          {available.map((player) => (
            <li key={player.player_id}>
              <span>
                {player.name} · {player.position || "FLEX"} · {player.team || "FA"}
              </span>

              <button
                type="button"
                disabled={disabled || selected.length >= 10}
                onClick={() => {
                  onAdd(player);
                  setQuery("");
                  setMatches([]);
                }}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul>
        {selected.map((player) => (
          <li key={player.player_id}>
            <span>
              {player.name} · {player.position || "FLEX"} · {player.team || "FA"}
            </span>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(player.player_id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {selected.length === 0 && <p className="muted">No players selected.</p>}
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
      <h2>Trade Evaluation</h2>
      <p>
        Select players on each side. Compare trade values to determine if a trade is fair, winning, or losing.
      </p>

      {/* Mode selection toggle */}
      <div className="trade-mode-selection">
        <label>
          <strong>Evaluation Model: </strong>
        </label>
        <button
          type="button"
          className={calcMode === "fancalc" ? "active-mode" : ""}
          onClick={() => {
            setCalcMode("fancalc");
            clearResult();
          }}
        >
          FanCalc (Standard)
        </button>
        {" "}
        <button
          type="button"
          className={calcMode === "experimental" ? "active-mode" : ""}
          onClick={() => {
            setCalcMode("experimental");
            clearResult();
          }}
        >
          Experimental (NFL Stats)
        </button>
      </div>

      <form onSubmit={evaluate}>
        <div className="trade-settings">
          {calcMode === "fancalc" ? (
            <>
              <label>
                League Type
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

              <label>
                Scoring
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

              <label>
                Quarterbacks
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

              <label>
                League Size
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
              <label>
                Season
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

              <label>
                Scoring
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
            </>
          )}
        </div>

        {calcMode === "experimental" && (
          <p className="experimental-notice">
            <em>Experimental Mode: Uses NFL play-by-play season statistics (WR only). In development.</em>
          </p>
        )}

        <div className="trade-columns">
          <PlayerPicker
            side="I give"
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
            side="I receive"
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

        <button
          type="submit"
          disabled={loading || give.length === 0 || receive.length === 0}
        >
          {loading ? "Calculating trade…" : "Evaluate trade"}
        </button>
      </form>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      {/* FanCalc Result Display */}
      {result && result.mode === "fancalc" && (
        <div className="trade-result" role="status">
          <h3>
            {result.favors === "Even" && "🤝 Fair Trade"}
            {result.favors === "Receive" && "🏆 Winning Trade (Favors You)"}
            {result.favors === "Give" && "⚠️ Losing Trade (Favors Other Team)"}
          </h3>

          <p>
            <strong>Status:</strong> {result.verdict}
          </p>

          <p>
            Give Total: <strong>{result.give_total.toLocaleString()}</strong> pts
            {" · "}
            Receive Total: <strong>{result.receive_total.toLocaleString()}</strong> pts
          </p>

          <p>
            Difference:{" "}
            <strong>
              {result.difference > 0 ? "+" : ""}
              {result.difference.toLocaleString()} pts
            </strong>
            {" "}
            ({result.diff_percentage > 0 ? "+" : ""}
            {result.diff_percentage}%)
          </p>

          <div className="trade-table">
            <table>
              <caption>
                {result.source} · {result.is_dynasty ? "Dynasty" : "Redraft"} ({result.ppr} PPR, {result.num_qbs} QB)
              </caption>
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
                      <td>{sideName}</td>
                      <td>{player.name}</td>
                      <td>{player.position}</td>
                      <td>{player.team}</td>
                      <td>{player.value.toLocaleString()}</td>
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

          <p className="muted">
            {result.attribution}:{" "}
            <a
              href={result.attribution_url || "https://fantasycalc.com"}
              target="_blank"
              rel="noopener noreferrer"
            >
              fantasycalc.com
            </a>
          </p>
        </div>
      )}

      {/* Experimental Result Display */}
      {result && result.mode === "experimental" && (
        <div className="trade-result" role="status">
          <h3>{result.verdict}</h3>

          <p>
            Give: <strong>{result.give_total.toFixed(2)}</strong>
            {" · "}
            Receive: <strong>{result.receive_total.toFixed(2)}</strong>
            {" "}points/game
          </p>

          <p>
            Difference:{" "}
            <strong>
              {result.difference > 0 ? "+" : ""}
              {result.difference.toFixed(2)}
            </strong>
            {" "}points/game
          </p>

          <div className="trade-table">
            <table>
              <caption>
                {result.season} · {result.source}
              </caption>
              <thead>
                <tr>
                  <th>Side</th>
                  <th>Player</th>
                  <th>Games</th>
                  <th>Rec/game</th>
                  <th>Rec yards/game</th>
                  <th>Rec TD/game</th>
                  <th>Points/game</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Give", result.give],
                  ["Receive", result.receive],
                ].flatMap(([sideName, players]) =>
                  players.map((player) => (
                    <tr key={`${sideName}-${player.player_id}`}>
                      <td>{sideName}</td>
                      <td>{player.name}</td>
                      <td>{player.games}</td>
                      <td>{player.averages?.receptions?.toFixed(2) ?? "—"}</td>
                      <td>{player.averages?.receiving_yards?.toFixed(2) ?? "—"}</td>
                      <td>{player.averages?.receiving_tds?.toFixed(2) ?? "—"}</td>
                      <td>{player.value?.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="muted">
            Scoring: 0.1/receiving or rushing yard; 6/TD; 0.04/passing yard; 4/passing TD; -2/INT or fumble; 2/2pt conversion. Season totals ÷ recorded games. WR only.
          </p>
        </div>
      )}
    </section>
  );
}
