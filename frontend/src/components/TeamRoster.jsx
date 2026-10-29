import "./TeamRoster.css";

export default function TeamRoster({ team, matchingPlayers }) {
  const players = team.players ?? [];

  // The backend already tells us whether each player is a starter.
  const starters = players.filter((player) => player.is_starter);
  const bench = players.filter((player) => !player.is_starter);

  // A Set makes it easy to check whether a player matched the search.
  const matchingIds = new Set(
    matchingPlayers.map((player) => player.player_id)
  );

  // Both roster sections use the same list layout.
  function renderPlayers(group) {
    if (group.length === 0) {
      return <p className="muted">No players listed.</p>;
    }

    return (
      <ul className="player-list">
        {group.map((player) => (
          <li
            key={player.player_id}
            className={
              matchingIds.has(player.player_id) ? "matched-player" : ""
            }
          >
            <span>{player.name}</span>

            {matchingIds.has(player.player_id) && (
              <span className="match-label">Matches search</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    // Details/summary gives us an expandable card with keyboard support.
    <details className="team-card">
      <summary>
        <span className="team-name">{team.team_name}</span>

        <span className="team-meta">
          Owner: {team.owner_name} · {players.length} players
        </span>

        {matchingPlayers.length > 0 && (
          <span className="match-summary">
            Matching players:{" "}
            {matchingPlayers.map((player) => player.name).join(", ")}
          </span>
        )}
      </summary>

      <div className="roster-details">
        <p className="muted">
          Record: {team.wins}-{team.losses}-{team.ties} · Points: {team.points}
        </p>

        {players.length === 0 ? (
          <p className="empty-message">
            This team does not have any players yet.
          </p>
        ) : (
          <div className="roster-columns">
            <section>
              <h3>Starters ({starters.length})</h3>
              {renderPlayers(starters)}
            </section>

            <section>
              {/* The current API doesn't separate bench, reserve, and taxi. */}
              <h3>Bench / other ({bench.length})</h3>
              {renderPlayers(bench)}
            </section>
          </div>
        )}
      </div>
    </details>
  );
}