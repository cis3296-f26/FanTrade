import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import TradeSuggestionResult from "./TradeSuggestionResult";
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

export default function TradeSuggestion({ leagueId, teams = [], loading = false, unavailable = false }) {
  // Remember both teams and the position preference. Any is the starting choice.
  // Switching leagues recreates this panel, which resets all three values.
  const [yourTeamId, setYourTeamId] = useState("");
  const [partnerTeamId, setPartnerTeamId] = useState("");
  const [position, setPosition] = useState("ANY");
  // Track the response, any request error, and whether we're still waiting.
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  // Keep the current request's controller between renders so we can cancel it.
  const activeRequest = useRef(null);

  // Switching leagues unmounts this panel, so stop any request still in flight.
  useEffect(() => () => activeRequest.current?.abort(), []);

  function clearSuggestion() {
    // A changed selection makes the previous result and request outdated.
    activeRequest.current?.abort();
    activeRequest.current = null;
    setResult(null);
    setError("");
    setGenerating(false);
  }

  async function createSuggestion() {
    // Don't send a request until both teams are valid or while one is running.
    if (!canCreate || generating) return;
    clearSuggestion();
    // Give this request its own controller and show the loading state.
    const controller = new AbortController();
    activeRequest.current = controller;
    setGenerating(true);

    try {
      // Send only selections; the backend loads rosters and values itself.
      const data = await fetchJson("/api/trade-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          league_id: String(leagueId),
          your_roster_id: yourTeamId,
          partner_roster_id: partnerTeamId,
          position,
        }),
      });
      // Both a suggestion and a completed search with no match are valid responses.
      if (data?.status !== "ok" && data?.status !== "no_match") {
        throw new Error("The server returned an unexpected suggestion response.");
      }
      // Only display the response if these selections are still current.
      if (!controller.signal.aborted) setResult(data);
    } catch (requestError) {
      // A canceled request should never overwrite the user's newer selections.
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      // An older request finishing must not turn off a newer request's loading state.
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setGenerating(false);
      }
    }
  }
  // Wait until the league has enough available teams to choose a trade partner.
  const disabled = loading || unavailable || teams.length < 2;
  // Enable the button only when both selections belong to this league and are different.
  const canCreate = Boolean(leagueId) && !disabled && yourTeamId !== partnerTeamId
    && teams.some((team) => String(team.roster_id) === yourTeamId)
    && teams.some((team) => String(team.roster_id) === partnerTeamId);

  return (
    <aside className="trade-suggestion" aria-labelledby="trade-suggestion-heading">
      <h3 id="trade-suggestion-heading">Trade Suggestion</h3>

      {/* Any lets the backend choose a need; the other options narrow the target. */}
      <div className="field">
        <label htmlFor="trade-position">Position to acquire</label>
        <select
          id="trade-position"
          value={position}
          disabled={disabled}
          onChange={(event) => {
            clearSuggestion();
            setPosition(event.target.value);
          }}
          aria-describedby="trade-position-help"
        >
          <option value="ANY">Any</option>
          <option value="QB">QB</option>
          <option value="RB">RB</option>
          <option value="WR">WR</option>
          <option value="TE">TE</option>
          <option value="FLEX">FLEX</option>
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
        onChange={(value) => {
          clearSuggestion();
          setYourTeamId(value);
        }}
        disabled={disabled}
      />
      <TeamSelector
        id="trade-partner-team"
        label="Select the Team You Want to Trade With"
        teams={teams}
        value={partnerTeamId}
        excludedId={yourTeamId}
        onChange={(value) => {
          clearSuggestion();
          setPartnerTeamId(value);
        }}
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

      {/* Keep selections editable during generation so users can change their search. */}
      <button type="button" disabled={!canCreate || generating} onClick={createSuggestion}>
        {generating ? "Finding a Trade…" : "Create Trade Suggestion"}
      </button>
      {/* Announce progress without moving keyboard focus away from the controls. */}
      <div role="status" aria-live="polite">
        {generating && <p className="muted">Comparing trades and both teams' lineups…</p>}
      </div>
      {/* Show request failures separately from successful results, including no matches. */}
      {error && <p className="error-message" role="alert">{error} You can try again.</p>}
      {result && <TradeSuggestionResult result={result} />}
    </aside>
  );
}
