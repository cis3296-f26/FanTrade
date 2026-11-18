// Required space is a constraint; the named players are suggestions for making that space.
export default function TradeRosterMoves({ moves }) {
  const teams = Object.entries(moves || {}).filter(([, team]) => team.required_drops > 0);
  if (teams.length === 0) return null;
  return (
    <section className="trade-roster-moves" aria-label="Required roster space and suggested moves">
      <h4>Roster space required</h4>
      {teams.map(([side, team]) => (
        <div key={side} className="trade-roster-move-team">
          <p><strong>{side === "you" ? "You" : team.team_name || "Your trade partner"} must drop {team.required_drops} {team.required_drops === 1 ? "player" : "players"}</strong> to complete this trade.</p>
          <h5>Suggested roster moves</h5>
          <ul>
            {team.suggested_drops.map((player) => (
              <li key={player.player_id}>Drop {player.name} <span className="muted">({player.position} · {player.value.toLocaleString()} value)</span></li>
            ))}
          </ul>
        </div>
      ))}
      <p className="muted">The net value shown uses these suggested cuts. Choosing different players changes the net value.</p>
    </section>
  );
}
