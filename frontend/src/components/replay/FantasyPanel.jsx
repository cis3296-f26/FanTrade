import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext";
import { fetchJson } from "../../lib/api";
import "./FantasyPanel.css";

export default function FantasyPanel({
  game,
  plays,
  playIndex,
  fantasyTotals,
  onRosterIdsChange,
}) {
  const { user, savedLeagues } = useAuth();
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [rosterContext, setRosterContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("roster"); // "roster" | "all"

  // Auto-select first saved league
  useEffect(() => {
    if (savedLeagues?.length > 0 && !selectedLeague) {
      setSelectedLeague(savedLeagues[0]);
    }
  }, [savedLeagues, selectedLeague]);

  // Fetch roster context when league or game changes
  useEffect(() => {
    if (!selectedLeague || !game) return;
    setLoading(true);
    setError(null);

    // Collect all player IDs from this game
    const allIds = new Set();
    for (const play of game.plays || []) {
      if (play.passer_id) allIds.add(play.passer_id);
      if (play.receiver_id) allIds.add(play.receiver_id);
      if (play.rusher_id) allIds.add(play.rusher_id);
      Object.keys(play.fantasy || {}).forEach((id) => allIds.add(id));
    }

    fetchJson(`/api/replay/roster-context?league_id=${selectedLeague.league_id}&player_ids=${[...allIds].join(",")}`)
      .then((data) => {
        setRosterContext(data);
        // Notify parent of roster player IDs so the play list can highlight them
        const ids = new Set(Object.keys(data.players || {}));
        onRosterIdsChange?.(ids);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.league_id, game?.game_id]);

  // Players from game who scored fantasy points
  const allScoringPlayers = Object.entries(fantasyTotals || {})
    .filter(([, v]) => v.pts !== 0)
    .sort((a, b) => b[1].pts - a[1].pts);

  const rosterPlayers = rosterContext
    ? allScoringPlayers.filter(([pid]) => rosterContext.players?.[pid])
    : [];

  const displayPlayers = mode === "roster" && rosterContext ? rosterPlayers : allScoringPlayers;

  // End of game summary
  const gameOver = playIndex >= (game?.plays?.length || 0) - 1;

  return (
    <div className="fantasy-panel">
      <div className="fantasy-panel-header">
        <h3 className="fantasy-panel-title">Fantasy</h3>
        <div className="fantasy-panel-tabs">
          <button
            className={`fantasy-tab${mode === "roster" ? " fantasy-tab--active" : ""}`}
            onClick={() => setMode("roster")}
          >
            My Roster
          </button>
          <button
            className={`fantasy-tab${mode === "all" ? " fantasy-tab--active" : ""}`}
            onClick={() => setMode("all")}
          >
            All Players
          </button>
        </div>
      </div>

      {/* League selector */}
      {user && savedLeagues?.length > 0 && (
        <div className="fantasy-league-row">
          <select
            className="fantasy-league-select"
            value={selectedLeague?.league_id || ""}
            onChange={(e) => {
              const lg = savedLeagues.find((l) => l.league_id === e.target.value);
              setSelectedLeague(lg || null);
            }}
          >
            {savedLeagues.map((lg) => (
              <option key={lg.league_id} value={lg.league_id}>
                {lg.league_name}
              </option>
            ))}
          </select>
          {rosterContext && (
            <span className="fantasy-scoring-badge">{rosterContext.scoring_type}</span>
          )}
        </div>
      )}

      {!user && (
        <p className="fantasy-sign-in-prompt">
          Sign in to see your roster's fantasy performance.
        </p>
      )}

      {loading && <p className="fantasy-status">Loading roster…</p>}
      {error && <p className="fantasy-status fantasy-status--error">{error}</p>}

      {mode === "roster" && rosterContext && rosterPlayers.length === 0 && !loading && (
        <p className="fantasy-status">None of your rostered players participated in this game.</p>
      )}

      {/* Player list */}
      <div className="fantasy-player-list">
        {displayPlayers.map(([pid, data]) => {
          const isRoster = rosterContext?.players?.[pid];
          const scoring = rosterContext?.scoring_settings;
          return (
            <div key={pid} className={`fantasy-player${isRoster ? " fantasy-player--roster" : ""}`}>
              <div className="fantasy-player-left">
                {isRoster && (
                  <img
                    className="fantasy-player-avatar"
                    src={isRoster.avatar_url}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="fantasy-player-info">
                  <span className="fantasy-player-name">{data.name || pid}</span>
                  {isRoster && (
                    <span className="fantasy-player-team">{isRoster.team} · {isRoster.position}</span>
                  )}
                </div>
              </div>
              <div className="fantasy-player-pts">
                <span className="fantasy-pts-value">{data.pts.toFixed(1)}</span>
                <span className="fantasy-pts-label">pts</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* End-of-game summary */}
      {gameOver && rosterPlayers.length > 0 && (
        <div className="fantasy-summary">
          <h4 className="fantasy-summary-title">Final Fantasy Summary</h4>
          <div className="fantasy-summary-stats">
            {rosterPlayers.slice(0, 5).map(([pid, data]) => {
              const info = rosterContext?.players?.[pid];
              const s = data.stats;
              const lines = [];
              if (s.pass_yd) lines.push(`${s.pass_yd} pass yds`);
              if (s.pass_td) lines.push(`${s.pass_td} pass TD`);
              if (s.rush_yd) lines.push(`${s.rush_yd} rush yds`);
              if (s.rush_td) lines.push(`${s.rush_td} rush TD`);
              if (s.rec) lines.push(`${s.rec} rec`);
              if (s.rec_yd) lines.push(`${Math.round(s.rec_yd)} rec yds`);
              if (s.rec_td) lines.push(`${s.rec_td} rec TD`);
              return (
                <div key={pid} className="fantasy-summary-player">
                  <span className="fantasy-summary-name">{data.name || pid}</span>
                  <span className="fantasy-summary-line">{lines.join(", ")}</span>
                  <span className="fantasy-summary-pts">{data.pts.toFixed(1)} pts</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
