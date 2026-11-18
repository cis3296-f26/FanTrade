import { useState, useEffect } from "react";
import "./GameSelector.css";

const SEASONS = [2024, 2023, 2022];
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

const TEAM_NAMES = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills",
  CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns",
  DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers",
  HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs",
  LV: "Raiders", LAC: "Chargers", LA: "Rams", LAR: "Rams",
  MIA: "Dolphins", MIN: "Vikings", NE: "Patriots", NO: "Saints",
  NYG: "Giants", NYJ: "Jets", PHI: "Eagles", PIT: "Steelers",
  SF: "49ers", SEA: "Seahawks", TB: "Buccaneers", TEN: "Titans",
  WAS: "Commanders",
};

export default function GameSelector({ onSelect }) {
  const [season, setSeason] = useState(2024);
  const [week, setWeek] = useState(1);
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/data/game-replays/manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load game manifest.");
        return r.json();
      })
      .then((data) => { setManifest(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const games = manifest
    ? manifest.filter((g) => g.season === season && g.week === week)
    : [];

  const availableWeeks = manifest
    ? [...new Set(manifest.filter((g) => g.season === season).map((g) => g.week))].sort((a, b) => a - b)
    : [];

  function handleWeekChange(w) {
    setWeek(w);
  }

  return (
    <div className="game-selector">
      <div className="game-selector-filters">
        <div className="game-selector-filter-group">
          <label className="game-selector-label">Season</label>
          <div className="game-selector-pills">
            {SEASONS.map((s) => (
              <button
                key={s}
                className={`game-selector-pill${season === s ? " game-selector-pill--active" : ""}`}
                onClick={() => { setSeason(s); setWeek(1); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="game-selector-filter-group">
          <label className="game-selector-label">Week</label>
          <div className="game-selector-pills game-selector-pills--weeks">
            {WEEKS.map((w) => {
              const hasData = availableWeeks.includes(w);
              return (
                <button
                  key={w}
                  className={`game-selector-pill${week === w ? " game-selector-pill--active" : ""}${!hasData ? " game-selector-pill--no-data" : ""}`}
                  onClick={() => handleWeekChange(w)}
                  disabled={!hasData}
                  title={!hasData ? "No replay data available for this week" : undefined}
                >
                  {w}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading && <p className="game-selector-status">Loading games…</p>}
      {error && <p className="game-selector-status game-selector-status--error">{error}</p>}

      {!loading && !error && games.length === 0 && (
        <div className="game-selector-empty">
          <p>No replay data for Week {week}, {season}.</p>
          <p className="game-selector-empty-hint">
            Run <code>python scripts/generate_game_replays.py --season {season} --week {week}</code> to generate it.
          </p>
        </div>
      )}

      {!loading && games.length > 0 && (
        <div className="game-selector-grid">
          {games.map((game) => (
            <button
              key={game.game_id}
              className="game-card"
              onClick={() => onSelect(game)}
            >
              <div className="game-card-teams">
                <div className="game-card-team">
                  <span className="game-card-abbr">{game.away_team}</span>
                  <span className="game-card-name">{TEAM_NAMES[game.away_team] || game.away_team}</span>
                </div>
                <div className="game-card-score">
                  <span>{game.away_score}</span>
                  <span className="game-card-at">–</span>
                  <span>{game.home_score}</span>
                </div>
                <div className="game-card-team game-card-team--home">
                  <span className="game-card-abbr">{game.home_team}</span>
                  <span className="game-card-name">{TEAM_NAMES[game.home_team] || game.home_team}</span>
                </div>
              </div>
              <div className="game-card-meta">
                <span>{game.play_count} plays</span>
                {game.game_date && <span>{game.game_date}</span>}
              </div>
              <div className="game-card-cta">Watch Replay →</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
