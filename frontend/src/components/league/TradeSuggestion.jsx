import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import TradeSuggestionResult from "./TradeSuggestionResult";
import CompatiblePartners from "./CompatiblePartners";
import Select, { SelectItem } from "../ui/Select";
import "./TradeSuggestion.css";

// Both team cards use the same selector, with their own label and selected team.
function TeamSelector({
  id,
  label,
  teams,
  value,
  excludedId,
  onChange,
  disabled,
  partnerMap,
}) {
  // Dropdown values are strings, so convert the roster ID before comparing it.
  const selectedTeam = teams.find((team) => String(team.roster_id) === value);
  const partnerInfo = partnerMap && value ? partnerMap[String(value)] : null;

  // If partnerMap is provided, sort teams by compatibility score descending so best matches show first
  const displayTeams = partnerMap
    ? [...teams].sort((a, b) => {
        const scoreA = partnerMap[String(a.roster_id)]?.compatibility_score || 0;
        const scoreB = partnerMap[String(b.roster_id)]?.compatibility_score || 0;
        return scoreB - scoreA;
      })
    : teams;

  return (
    <details className="trade-team-card" open>
      {/* Clicking the card opens its dropdown. The chosen team stays visible when closed. */}
      <summary>
        <span>{label}</span>
        {selectedTeam ? (
          <>
            <strong>{selectedTeam.team_name}</strong>
            <span className="muted">Owner: {selectedTeam.owner_name}</span>
            {partnerInfo && (
              <span className="trade-match-indicator">
                {partnerInfo.compatibility_score}% Match · {partnerInfo.primary_axis}
              </span>
            )}
            <span className="trade-selection-hint">Change team ▾</span>
          </>
        ) : (
          <span className="trade-selection-hint">Choose a team ▾</span>
        )}
      </summary>
      {/* Send selection changes back to the panel so it can keep both cards in sync. */}
      <div className="field trade-team-options">
        <label htmlFor={id}>{label}</label>
        <Select
          id={id}
          value={value}
          placeholder="Select a team"
          disabled={disabled}
          onChange={(v) => onChange(v)}
        >
          {displayTeams.map((team) => {
            const teamPartner = partnerMap ? partnerMap[String(team.roster_id)] : null;
            return (
              <SelectItem
                key={team.roster_id}
                value={String(team.roster_id)}
                disabled={String(team.roster_id) === excludedId}
              >
                {team.team_name} · {team.owner_name}
                {teamPartner ? ` (${teamPartner.compatibility_score}% match)` : ""}
              </SelectItem>
            );
          })}
        </Select>
      </div>
    </details>
  );
}

export default function TradeSuggestion({
  leagueId,
  teams = [],
  loading = false,
  unavailable = false,
}) {
  // Remember both teams and the position preference. Any is the starting choice.
  // Switching leagues recreates this panel, which resets all three values.
  const [yourTeamId, setYourTeamId] = useState("");
  const [partnerTeamId, setPartnerTeamId] = useState("");
  const [position, setPosition] = useState("ANY");
  // Track the response, any request error, and whether we're still waiting.
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  // Keep track of compatible partner matches and our team's surplus/need analysis
  const [partners, setPartners] = useState([]);
  const [yourAnalysis, setYourAnalysis] = useState(null);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [partnersError, setPartnersError] = useState("");

  // Keep the current request's controller between renders so we can cancel it.
  const activeRequest = useRef(null);
  const activePartnersRequest = useRef(null);

  // Switching leagues unmounts this panel, so stop any request still in flight.
  useEffect(() => {
    return () => {
      activeRequest.current?.abort();
      activePartnersRequest.current?.abort();
    };
  }, []);

  function clearSuggestion() {
    // A changed selection makes the previous result and request outdated.
    activeRequest.current?.abort();
    activeRequest.current = null;
    setResult(null);
    setError("");
    setGenerating(false);
  }

  // When the user picks their team, scan the other rosters in the league for compatible trade partners
  useEffect(() => {
    activePartnersRequest.current?.abort();
    activePartnersRequest.current = null;

    if (!yourTeamId || !leagueId || loading || unavailable || teams.length < 2) {
      return;
    }

    const controller = new AbortController();
    activePartnersRequest.current = controller;
    setLoadingPartners(true);

    fetchJson("/api/trade-suggestions/compatible-partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        league_id: String(leagueId),
        your_roster_id: yourTeamId,
      }),
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data?.status === "ok") {
            setPartners(data.partners || []);
            setYourAnalysis(data.your_analysis || null);
          } else {
            setPartnersError(data?.error || "Could not load compatible partners.");
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setPartnersError(err.message || "Failed to scan for trade partners.");
        }
      })
      .finally(() => {
        if (activePartnersRequest.current === controller) {
          activePartnersRequest.current = null;
          setLoadingPartners(false);
        }
      });

    return () => controller.abort();
  }, [leagueId, yourTeamId, loading, unavailable, teams.length]);

  // When someone clicks a recommended partner card, pre-populate the partner dropdown and target position
  function handleSelectPartner(partner) {
    clearSuggestion();
    setPartnerTeamId(String(partner.roster_id));
    if (partner.target_position && partner.target_position !== "ANY") {
      setPosition(partner.target_position);
    }
  }

  // Fast map lookup so the team dropdown can grab match scores and insights
  const partnerMap = {};
  for (const p of partners) {
    partnerMap[String(p.roster_id)] = p;
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
  const canCreate =
    Boolean(leagueId) &&
    !disabled &&
    yourTeamId !== partnerTeamId &&
    teams.some((team) => String(team.roster_id) === yourTeamId) &&
    teams.some((team) => String(team.roster_id) === partnerTeamId);

  return (
    <aside className="trade-suggestion" aria-labelledby="trade-suggestion-heading">
      <h3 id="trade-suggestion-heading">Trade Suggestion</h3>

      {/* Any lets the backend choose a need; the other options narrow the target. */}
      <div className="field">
        <label htmlFor="trade-position">Position to acquire</label>
        <Select
          id="trade-position"
          value={position}
          disabled={disabled}
          onChange={(v) => {
            clearSuggestion();
            setPosition(v);
          }}
          aria-describedby="trade-position-help"
        >
          <SelectItem value="ANY">Any</SelectItem>
          <SelectItem value="QB">QB</SelectItem>
          <SelectItem value="RB">RB</SelectItem>
          <SelectItem value="WR">WR</SelectItem>
          <SelectItem value="TE">TE</SelectItem>
          <SelectItem value="FLEX">FLEX</SelectItem>
        </Select>
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
          setPartners([]);
          setYourAnalysis(null);
          setPartnersError("");
        }}
        disabled={disabled}
      />

      {/* Recommended trade partners based on positional dropoff & surplus depth */}
      {yourTeamId && (
        <CompatiblePartners
          partners={partners}
          yourAnalysis={yourAnalysis}
          selectedPartnerId={partnerTeamId}
          loading={loadingPartners}
          error={partnersError}
          onSelectPartner={handleSelectPartner}
          disabled={disabled || generating}
        />
      )}

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
        partnerMap={partnerMap}
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
      <button
        type="button"
        disabled={!canCreate || generating}
        onClick={createSuggestion}
      >
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
