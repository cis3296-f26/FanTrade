import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
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
    }, 300);

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
      <h3>{side}</h3>

      <label>
        {side}: 
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Players"
          disabled={disabled}
        />
      </label>

      {loading && <p role="status">Searching players…</p>}
      {error && <p role="alert">{error}</p>}

      {!loading &&
        query.trim().length >= 2 &&
        !error &&
        available.length === 0 && <p>No available matches.</p>}

      <ul className="trade-matches">
        {available.map((player) => (
          <li key={player.player_id}>
            <span>
              {player.name} · {player.team}
            </span>

            <button
              type="button"
              disabled={disabled || selected.length >= 10}
              onClick={() => {
                onAdd(player);
                setQuery("");
              }}
            >
              Add
              <span className="trade-sr">
                {player.name} to {side}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <ul>
        {selected.map((player) => (
          <li key={player.player_id}>
            <span>
              {player.name} · {player.team}
            </span>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(player.player_id)}
            >
              Remove
              <span className="trade-sr">
                {player.name} from {side}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected.length === 0 && <p>No players selected.</p>}
    </section>
  );
}

export default function TradeEvaluation() {
  const year = new Date().getFullYear();

  const [season, setSeason] = useState(
    new Date().getMonth() >= 8 ? year : year - 1
  );
  const [ppr, setPpr] = useState(1);
  const [give, setGive] = useState([]);
  const [receive, setReceive] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const clearResult = () => {
    setResult(null);
    setError("");
  };

  const excluded = [...give, ...receive].map(
    (player) => player.player_id
  );

  async function evaluate(event) {
    event.preventDefault();
    clearResult();
    setLoading(true);

    try {
      const data = await fetchJson("/api/trade-evaluation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          season,
          ppr,
          give: give.map((player) => player.player_id),
          receive: receive.map((player) => player.player_id),
        }),
      });

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="trade-evaluator">
      <h2>Trade Evaluation</h2>

      <p>
        Select players on each side. Values use actual regular-season averages.
      </p>

      <form onSubmit={evaluate}>
        <div className="trade-settings">
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
                { length: year - 1998 },
                (_, index) => year - index
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
        </div>

        <div className="trade-columns">
          {[
            ["I give", give, setGive],
            ["I receive", receive, setReceive],
          ].map(([side, selected, setter]) => (
            <PlayerPicker
              key={side}
              side={side}
              selected={selected}
              excluded={excluded}
              disabled={loading}
              onAdd={(player) => {
                setter((previous) => [...previous, player]);
                clearResult();
              }}
              onRemove={(id) => {
                setter((previous) =>
                  previous.filter((player) => player.player_id !== id)
                );
                clearResult();
              }}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || !give.length || !receive.length}
        >
          {loading
            ? "Loading stats and calculating…"
            : "Evaluate trade"}
        </button>
      </form>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      {result && (
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
                ].flatMap(([side, players]) =>
                  players.map((player) => (
                    <tr key={player.player_id}>
                      <td>{side}</td>
                      <td>{player.name}</td>
                      <td>{player.games}</td>
                      <td>
                        {player.averages.receptions.toFixed(2)}
                      </td>
                      <td>
                        {player.averages.receiving_yards.toFixed(2)}
                      </td>
                      <td>
                        {player.averages.receiving_tds.toFixed(2)}
                      </td>
                      <td>{player.value.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="muted">
        Scoring: <br /> 0.1/receiving or rushing yard;
        <br /> 6/receiving or rushing TD; 0.04/passing yard;
        <br /> 4/passing TD; -2/interception or fumble lost;
        <br /> 2/two-point conversion; selected PPR per catch.
        <br /> Season totals ÷ recorded games.
        <br /> No projections or automatic trade suggestions.
        <br /> Multi-player totals do not account for starting lineup
        limits, injuries, or positional needs.
      </p>
