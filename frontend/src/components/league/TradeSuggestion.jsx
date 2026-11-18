import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import TradeSuggestionResult from "./TradeSuggestionResult";
import CompatiblePartners from "./CompatiblePartners";
import TradeWinRange from "./TradeWinRange";
import TradeStyleSelector from "./TradeStyleSelector";
import useTradePartners from "./useTradePartners";
import { matchingPreview, selectionKey } from "./tradeSuggestionState";
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

export default function TradeSuggestion({ leagueId, teams = [], loading = false, unavailable = false }) {
  // League changes recreate the panel, resetting all team and preference selections.
  const [yourTeamId, setYourTeamId] = useState("");
  const [partnerTeamId, setPartnerTeamId] = useState("");
  const [position, setPosition] = useState("ANY");
  const [tradeStyle, setTradeStyle] = useState("any");
  const [range, setRange] = useState([4, 12]);
  const [committedRange, setCommittedRange] = useState([4, 12]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const activeRequest = useRef(null);
  const disabled = loading || unavailable || teams.length < 2;
  const editingRange = range[0] !== committedRange[0] || range[1] !== committedRange[1];
  const request = {
    league_id: String(leagueId), your_roster_id: yourTeamId, position,
    min_gain_percent: committedRange[0], max_gain_percent: committedRange[1], trade_style: tradeStyle,
  };
  const requestKey = JSON.stringify(request);
  const partners = useTradePartners(requestKey, Boolean(leagueId && yourTeamId) && !disabled && !editingRange);
  const partnerMap = Object.fromEntries(partners.partners.map((partner) => [String(partner.roster_id), partner]));
  const canCreate = Boolean(leagueId) && !disabled && !editingRange && yourTeamId !== partnerTeamId &&
    teams.some((team) => String(team.roster_id) === yourTeamId) &&
    teams.some((team) => String(team.roster_id) === partnerTeamId);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function clearResult() {
    // Cancel old work so a late response cannot replace a newer selection.
    activeRequest.current?.abort();
    activeRequest.current = null;
    setResult(null);
    setError("");
    setGenerating(false);
  }

  function invalidateSelection() {
    clearResult();
    setSelectedPreview(null);
  }

  function handleSelectPartner(partner) {
    invalidateSelection();
    const partnerId = String(partner.roster_id);
    const target = position === "ANY" && ["QB", "RB", "WR", "TE"].includes(partner.target_position)
      ? partner.target_position : position;
    setPartnerTeamId(partnerId);
    setPosition(target);
    // Keep the verified package when ANY autofills a specific position. Its key
    // includes that new position and both teams, so later edits invalidate it.
    const nextRequest = { ...request, position: target };
    const preview = matchingPreview(partner, nextRequest);
    if (preview) setSelectedPreview({ key: selectionKey(nextRequest, partnerId), result: preview });
  }

  async function createSuggestion() {
    if (!canCreate || generating) return;
    const key = selectionKey(request, partnerTeamId);
    const preview = selectedPreview?.key === key ? selectedPreview.result : matchingPreview(partnerMap[partnerTeamId], request);
    clearResult();
    if (preview) {
      setResult(preview);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setGenerating(true);
    try {
      const data = await fetchJson("/api/trade-suggestions", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...request, partner_roster_id: partnerTeamId }),
      });
      if (data?.status !== "ok" && data?.status !== "no_match") {
        throw new Error("The server returned an unexpected suggestion response.");
      }
      if (!controller.signal.aborted) setResult(data);
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setGenerating(false);
      }
    }
  }

  return (
    <aside className="trade-suggestion" aria-labelledby="trade-suggestion-heading">
      <h3 id="trade-suggestion-heading">Trade Suggestion</h3>
      <div className="field">
        <label htmlFor="trade-position">Position to acquire</label>
        <Select id="trade-position" value={position} disabled={disabled}
          onChange={(value) => { invalidateSelection(); setPosition(value); }}
          aria-describedby="trade-position-help">
          <SelectItem value="ANY">Any</SelectItem>
          <SelectItem value="QB">QB</SelectItem>
          <SelectItem value="RB">RB</SelectItem>
          <SelectItem value="WR">WR</SelectItem>
          <SelectItem value="TE">TE</SelectItem>
          <SelectItem value="FLEX">FLEX</SelectItem>
        </Select>
        <p id="trade-position-help" className="muted trade-control-help">Any covers QB, RB, WR, and TE. FLEX covers RB, WR, and TE.</p>
      </div>

      <TradeStyleSelector value={tradeStyle} disabled={disabled}
        onChange={(value) => { invalidateSelection(); setTradeStyle(value); }} />
      <TradeWinRange value={range} disabled={disabled}
        onChange={(value) => { invalidateSelection(); setRange(value); }}
        onCommit={(value) => { setRange(value); setCommittedRange(value); }} />

      {/* Selecting either team excludes it from the other team's dropdown. */}
      <TeamSelector id="trade-your-team" label="Select Your Team" teams={teams}
        value={yourTeamId} excludedId={partnerTeamId} disabled={disabled}
        onChange={(value) => { invalidateSelection(); setYourTeamId(value); }} />

      {yourTeamId && (
        <CompatiblePartners
          key={requestKey}
          partners={partners.partners} yourAnalysis={partners.analysis} targetPosition={position}
          selectedPartnerId={partnerTeamId} loading={partners.loading} error={partners.error}
          warnings={partners.warnings} visibleCount={partners.visibleCount} nextOffset={partners.nextOffset}
          onLoadMore={partners.loadMore} onRetry={partners.retry} onSelectPartner={handleSelectPartner}
          disabled={disabled || generating || editingRange || partners.loading}
        />
      )}

      <TeamSelector id="trade-partner-team" label="Select the Team You Want to Trade With"
        teams={teams} value={partnerTeamId} excludedId={yourTeamId} disabled={disabled}
        partnerMap={editingRange ? {} : partnerMap}
        onChange={(value) => { invalidateSelection(); setPartnerTeamId(value); }} />

      {loading ? <p className="muted" role="status">Loading teams...</p>
        : unavailable ? <p className="muted">Teams are unavailable. Retry loading the league.</p>
        : teams.length < 2 ? <p className="muted">At least two teams are needed to select a trade partner.</p> : null}

      <button type="button" className="btn btn-primary btn-md" disabled={!canCreate || generating} onClick={createSuggestion}>
        {generating ? "Finding a Trade…" : "Create Trade Suggestion"}
      </button>
      <div role="status" aria-live="polite">
        {generating && <p className="muted">Comparing trades and both teams' lineups…</p>}
      </div>
      {error && <p className="error-message" role="alert">{error} You can try again.</p>}
      {result && <TradeSuggestionResult result={result} />}
    </aside>
  );
}
