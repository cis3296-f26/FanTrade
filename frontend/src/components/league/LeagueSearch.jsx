import { useState } from "react";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import RosterSearch from "./RosterSearch";
import Select, { SelectItem } from "../ui/Select";
import "./LeagueSearch.css";

export default function LeagueSearch() {
  const { user, savedLeagues, loading: authLoading, updateSavedLeague } = useAuth();

  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [leagueId, setLeagueId] = useState("");
  const [savedLeagueId, setSavedLeagueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedLeagueError, setSavedLeagueError] = useState("");

  const selectedLeague = profile?.leagues.find(
    (league) => league.league_id === leagueId
  );
  const selectedLeagueIsSaved = savedLeagues.some(
    (league) => league.league_id === leagueId && league.platform === "sleeper"
  );
  const activeLeagueId = leagueId || savedLeagueId;

  async function handleSaveLeague() {
    if (!selectedLeague || !user || saving) {
      return;
    }

    setSaving(true);
    setSavedLeagueError("");
    try {
      await updateSavedLeague("POST", {
        league_id: selectedLeague.league_id,
        league_name: selectedLeague.name,
        platform: "sleeper",
      });
    } catch (requestError) {
      setSavedLeagueError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSavedLeague() {
    if (!savedLeagueId || saving) {
      return;
    }

    setSaving(true);
    setSavedLeagueError("");
    try {
      await updateSavedLeague("DELETE", {
        league_id: savedLeagueId,
        platform: "sleeper",
      });
      setSavedLeagueId("");
    } catch (requestError) {
      setSavedLeagueError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const cleanUsername = username.trim();

    if (!cleanUsername || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setProfile(null);
    setLeagueId("");
    setSavedLeagueId("");

    try {
      const data = await fetchJson(
        `/api/sleeper?username=${encodeURIComponent(cleanUsername)}`
      );

      if (!Array.isArray(data.leagues)) {
        throw new Error("The server did not return a valid league list.");
      }

      setProfile(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="league-search-heading">
      <h1 id="league-search-heading" className="page-title">Find Your League</h1>

      <p className="muted">
        Enter a Sleeper username to find its leagues for the active season.
      </p>

      <form className="username-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="sleeper-username">Sleeper username</label>

          <input
            id="sleeper-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter a username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={loading}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-md"
          disabled={loading || !username.trim()}
        >
          {loading ? "Finding leagues..." : "Find leagues"}
        </button>
      </form>

      {loading && <p role="status">Loading leagues from Sleeper...</p>}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {profile && (
        <div className="league-selection">
          <p role="status">
            {profile.display_name} · Season {profile.active_season} ·{" "}
            {profile.leagues.length} leagues
          </p>

          {profile.leagues.length === 0 ? (
            <p className="empty-message">
              No leagues were found for this user in the active season.
              Try another Sleeper username.
            </p>
          ) : (
            <div className="field">
              <label htmlFor="league-select">Choose a league</label>
              <Select
                id="league-select"
                value={leagueId}
                placeholder="Select a league"
                onChange={(v) => {
                  setLeagueId(v);
                  setSavedLeagueId("");
                  setSavedLeagueError("");
                }}
              >
                {profile.leagues.map((league) => (
                  <SelectItem key={league.league_id} value={league.league_id}>
                    {league.name} · {league.total_rosters} teams · {league.scoring_type}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}

          {selectedLeague && user && (
            <div className="save-league-control">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSaveLeague}
                disabled={saving || selectedLeagueIsSaved}
              >
                {saving
                  ? "Saving..."
                  : selectedLeagueIsSaved
                    ? "League saved"
                    : "Save this league"}
              </button>
            </div>
          )}
        </div>
      )}

      {user && (
        <div className="saved-leagues">
          <h3>Saved leagues</h3>
          {authLoading ? (
            <p role="status">Loading your saved leagues...</p>
          ) : savedLeagues.length === 0 ? (
            <p className="muted">
              You haven&apos;t saved any leagues yet. Find a league above and save it to your account.
            </p>
          ) : (
            <div className="field">
              <label htmlFor="saved-league-select">Open a saved league</label>
              <Select
                id="saved-league-select"
                value={savedLeagueId}
                placeholder="Select a saved league"
                onChange={(v) => {
                  setSavedLeagueId(v);
                  setLeagueId("");
                  setSavedLeagueError("");
                }}
              >
                {savedLeagues.map((league) => (
                  <SelectItem key={`${league.platform}:${league.league_id}`} value={league.league_id}>
                    {league.league_name}
                  </SelectItem>
                ))}
              </Select>
              {savedLeagueId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRemoveSavedLeague}
                  disabled={saving}
                >
                  {saving ? "Removing..." : "Remove saved league"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {savedLeagueError && (
        <p className="error-message" role="alert">
          {savedLeagueError}
        </p>
      )}

      {activeLeagueId && (
        <RosterSearch key={activeLeagueId} leagueId={activeLeagueId} />
      )}
    </section>
  );
}