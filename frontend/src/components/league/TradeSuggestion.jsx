import { useState } from "react";
import "./TradeSuggestion.css";

// Both team cards use the same selector, with their own label and selected team.
function TeamSelector({ id, label, teams, value, excludedId, onChange, disabled }) {
  // Dropdown values are strings, so convert the roster ID before comparing it.
  const selectedTeam = teams.find((team) => String(team.roster_id) === value);

  return (
    <details className="trade-team-card">
      {/* Clicking the card opens its dropdown. The chosen team stays visible when closed. */}
      <summary>
        <span>{label}</span>
        {selectedTeam ? (
          <>
            <strong>{selectedTeam.team_name}</strong>
            <span className="muted">Owner: {selectedTeam.owner_name}</span>
            <span className="trade-selection-hint">Change team ▾</span>
          </>
        ) : (
          <span className="trade-selection-hint">Choose a team ▾</span>
        )}
      </summary>
      {/* Send selection changes back to the panel so it can keep both cards in sync. */}
      <div className="field trade-team-options">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select a team</option>
          {/* List every team, but disable the one already chosen in the other card. */}
          {teams.map((team) => (
            <option
              key={team.roster_id}
              value={String(team.roster_id)}
              disabled={String(team.roster_id) === excludedId}
            >
              {team.team_name} · {team.owner_name}
            </option>
          ))}
        </select>
      </div>
    </details>
  );
}

export default function TradeSuggestion({ teams = [], loading = false, unavailable = false }) {
  // Remember both teams and the position preference. Any is the starting choice.
  // Switching leagues recreates this panel, which resets all three values.
  const [yourTeamId, setYourTeamId] = useState("");
  const [partnerTeamId, setPartnerTeamId] = useState("");
  const [position, setPosition] = useState("ANY");
  // Wait until the league has enough available teams to choose a trade partner.
  const disabled = loading || unavailable || teams.length < 2;
  // Enable the button only when both selections belong to this league and are different.
  const canCreate = !disabled && yourTeamId !== partnerTeamId
    && teams.some((team) => String(team.roster_id) === yourTeamId)
    && teams.some((team) => String(team.roster_id) === partnerTeamId);

  return (
    <aside className="trade-suggestion" aria-labelledby="trade-suggestion-heading">
      <h3 id="trade-suggestion-heading">Trade Suggestion</h3>

      {/* Save the desired position for now; suggestion logic will use it later. */}
      <div className="field">
        <label htmlFor="trade-position">Position to acquire</label>
        <select
          id="trade-position"
          value={position}
          disabled={disabled}
          onChange={(event) => setPosition(event.target.value)}
          aria-describedby="trade-position-help"
        >
          <option value="ANY">Any</option>
          <option value="QB">QB</option>
          <option value="RB">RB</option>
          <option value="WR">WR</option>
          <option value="TE">TE</option>
          <option value="FLEX">FLEX</option>
          <option value="K">Kicker</option>
          <option value="DEF">Defense / Special Teams</option>
        </select>
        <p id="trade-position-help" className="muted">
          Any covers QB, RB, WR, and TE. FLEX covers RB, WR, and TE.
        </p>
      </div>

      {/* Each card gets the other card's selection so a team can't trade with itself. */}
      <TeamSelector
        id="trade-your-team"
        label="Select Your Team"
        teams={teams}
        value={yourTeamId}
        excludedId={partnerTeamId}
        onChange={setYourTeamId}
        disabled={disabled}
      />
      <TeamSelector
        id="trade-partner-team"
        label="Select the Team You Want to Trade With"
        teams={teams}
        value={partnerTeamId}
        excludedId={yourTeamId}
        onChange={setPartnerTeamId}
        disabled={disabled}
      />

      {/* Explain why selection is unavailable while loading, after an error, or in a small league. */}
      {loading ? (
        <p className="muted" role="status">Loading teams...</p>
      ) : unavailable ? (
        <p className="muted">Teams are unavailable. Retry loading the league.</p>
      ) : teams.length < 2 ? (
        <p className="muted">At least two teams are needed to select a trade partner.</p>
      ) : null}

      {/* This button only becomes clickable for now; it doesn't generate a suggestion yet. */}
      <button type="button" disabled={!canCreate}>Create Trade Suggestion</button>
    </aside>
  );
}
