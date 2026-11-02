import "./TeamRoster.css";

const DEFAULT_AVATAR = "https://sleepercdn.com/images/v2/icons/player_default.webp";

export default function TeamRoster({ team, matchingPlayers }) {
  const players = team.players ?? [];
  const starters = players.filter((p) => p.is_starter);
  const bench = players.filter((p) => !p.is_starter);
  const matchingIds = new Set(matchingPlayers.map((p) => p.player_id));

  function renderGroup(group) {
    if (group.length === 0) return <p className="muted">No players listed.</p>;

    return (
      <ul className="player-list">
        {group.map((p) => {
          const isMatched = matchingIds.has(p.player_id);
          const isHealthy = p.injury_status === "Healthy";

          return (
            <li key={p.player_id} className={`player-row ${isMatched ? "matched-player" : ""}`}>
              <div className="player-left">
                <img
                  src={p.avatar_url || DEFAULT_AVATAR}
                  alt={p.name}
                  className="player-avatar"
                  loading="lazy"
                  onError={(e) => (e.currentTarget.src = DEFAULT_AVATAR)}
                />
                <div className="player-details">
                  <div className="player-top">
                    <span className="player-name">{p.full_name || p.name}</span>
                    <span className={`injury-badge ${isHealthy ? "healthy" : "injured"}`}>
                      {p.injury_status || "Healthy"}
                    </span>
                  </div>
                  <div className="player-meta">
                    <span className="pos-badge">
                      {p.slot && p.slot !== "BN" && p.slot !== p.position
                        ? `${p.slot} (${p.position})`
                        : p.position}
                    </span>
                    <span>{p.team}</span>
                    {p.matchup && <span className="matchup-badge">{p.matchup}</span>}
                  </div>
                </div>
              </div>

              <div className="player-scores">
                <div className="score-col">
                  <span className="score-val">
                    {typeof p.actual_points === "number"
                      ? p.actual_points.toFixed(2)
                      : "—"}
                  </span>
                  <span className="score-lbl">Pts</span>
                </div>
                <div className="score-col muted-score">
                  <span className="score-val">
                    {typeof p.projected_points === "number"
                      ? p.projected_points.toFixed(2)
                      : "—"}
                  </span>
                  <span className="score-lbl">Proj</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <details className="team-card">
      <summary>
        <span className="team-name">{team.team_name}</span>
        <span className="team-meta">
          Owner: {team.owner_name} · {players.length} players
        </span>
        {matchingPlayers.length > 0 && (
          <span className="match-summary">
            Matching players: {matchingPlayers.map((p) => p.name).join(", ")}
          </span>
        )}
      </summary>

      <div className="roster-details">
        <p className="muted">
          Record: {team.wins}-{team.losses}-{team.ties} · Points: {team.points}
        </p>

        {players.length === 0 ? (
          <p className="empty-message">This team does not have any players yet.</p>
        ) : (
          <div className="roster-columns">
            <section>
              <h3>Starters ({starters.length})</h3>
              {renderGroup(starters)}
            </section>
            <section>
              <h3>Bench ({bench.length})</h3>
              {renderGroup(bench)}
            </section>
          </div>
        )}
      </div>
    </details>
  );
}
