import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import RosterSearch from "./RosterSearch";
import Select, { SelectItem } from "../ui/Select";
import "./LeagueSearch.css";

function savedLeagueKey(league) {
  return `${league.platform}:${league.league_id}`;
}

export default function LeagueSearch() {
  const { user, savedLeagues, loading: authLoading, updateSavedLeague } = useAuth();

  const [espnLink, setEspnLink] = useState("");
  const [espnLeague, setEspnLeague] = useState("");
  const [espnError, setEspnError] = useState("");
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [leagueId, setLeagueId] = useState("");
  const [savedLeagueId, setSavedLeagueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedLeagueError, setSavedLeagueError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const autoSelectedRef = useRef(false);

  // Auto-select the first saved league on initial load for signed-in users
  useEffect(() => {
    if (authLoading) return;
    if (!autoSelectedRef.current && user && savedLeagues.length > 0 && !savedLeagueId && !leagueId) {
      autoSelectedRef.current = true;
      setSavedLeagueId(savedLeagueKey(savedLeagues[0]));
    }
  }, [authLoading, user, savedLeagues, savedLeagueId, leagueId]);

  const selectedLeague = profile?.leagues.find(
    (league) => league.league_id === leagueId
  );
  const selectedLeagueIsSaved = savedLeagues.some(
    (league) => league.league_id === leagueId && league.platform === "sleeper"
  );
  const savedLeague = savedLeagues.find((league) => savedLeagueKey(league) === savedLeagueId);
  const platform = espnLeague ? "espn" : savedLeague?.platform || "sleeper";
  const activeLeagueId = espnLeague || leagueId || savedLeague?.league_id;

  function handleEspnSubmit(event) {
    event.preventDefault();
    setEspnError("");
    try {
      const url = new URL(espnLink.trim());
      const id = url.searchParams.get("leagueId");
      const today = new Date();
      const currentSeason = today.getFullYear() - Number(today.getMonth() < 7);
      const season = url.searchParams.get("seasonId") ?? String(currentSeason);
      if (url.origin !== "https://fantasy.espn.com" ||
          url.pathname.replace(/\/$/, "") !== "/football/league" ||
          !/^\d+$/.test(id ?? "") || !/^\d{4}$/.test(season)) {
        throw new Error();
      }
      setLeagueId("");
      setSavedLeagueId("");
      setSavedLeagueError("");
      setEspnLeague(`${season}:${id}`);
    } catch {
      setEspnError("Paste a public ESPN Fantasy Football League Office link.");
    }
  }

  const hasSavedLeagues = Boolean(user && savedLeagues.length > 0);
  const shouldShowSearchForm = !user || !hasSavedLeagues || showSearch;

  async function handleSaveLeague(league, leaguePlatform) {
    if (!league || !user || saving) {
      return;
    }

    setSaving(true);
    setSavedLeagueError("");
    try {
      await updateSavedLeague("POST", {
        league_id: league.league_id,
        league_name: league.name,
        platform: leaguePlatform,
      });
    } catch (requestError) {
      setSavedLeagueError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSavedLeague() {
    if (!savedLeague || saving) {
      return;
    }

    setSaving(true);
    setSavedLeagueError("");
    try {
      await updateSavedLeague("DELETE", {
        league_id: savedLeague.league_id,
        platform: savedLeague.platform,
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
    setEspnLeague("");
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

  if (authLoading) {
    return (
      <section aria-labelledby="league-search-heading">
        <h1 id="league-search-heading" className="page-title">League View</h1>
        <p className="muted" role="status">Loading your leagues...</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="league-search-heading">
      <h1 id="league-search-heading" className="page-title">
        {hasSavedLeagues ? "League View" : "Find Your League"}
      </h1>

      {hasSavedLeagues && (
        <div className="saved-leagues-bar">
          <div className="field">
            <label htmlFor="saved-league-select">Your Saved Leagues</label>
            <div className="saved-league-controls">
              <Select
                id="saved-league-select"
                value={savedLeagueId}
                placeholder="Select a saved league"
                onChange={(v) => {
                  setSavedLeagueId(v);
                  setEspnLeague("");
                  setLeagueId("");
                  setSavedLeagueError("");
                }}
              >
                {savedLeagues.map((league) => (
                  <SelectItem key={savedLeagueKey(league)} value={savedLeagueKey(league)}>
                    {league.league_name}{league.platform === "espn" ? " · ESPN" : ""}
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
                  {saving ? "Removing..." : "Remove league"}
                </button>
              )}
            </div>
          </div>

          <div className="search-toggle-wrap">
            <button
              type="button"
              className="btn btn-ghost search-toggle-btn"
              onClick={() => setShowSearch((prev) => !prev)}
            >
              {showSearch ? "Hide league search ▴" : "+ Find another league ▾"}
            </button>
          </div>
        </div>
      )}

      {user && !hasSavedLeagues && (
        <p className="muted">
          You haven&apos;t saved any leagues yet. Find a Sleeper or ESPN league below.
        </p>
      )}

      {!user && (
        <p className="muted">
          Search with a Sleeper username or a public ESPN league link.
        </p>
      )}

      {shouldShowSearchForm && (
        <div className={hasSavedLeagues ? "sleeper-search-container" : ""}>
          {hasSavedLeagues && (
            <p className="muted" style={{ margin: "0 0 12px" }}>
              Search a Sleeper username to find and save additional leagues to your account.
            </p>
          )}

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
                  No leagues were found for this user in the active season. Try another Sleeper username.
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
                      setEspnLeague("");
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
                    onClick={() => handleSaveLeague(selectedLeague, "sleeper")}
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
        </div>
      )}

      {shouldShowSearchForm && (
        <form className="username-form" onSubmit={handleEspnSubmit}>
          <div className="field">
            <label htmlFor="espn-league-link">Public ESPN League Office link</label>
            <input
              id="espn-league-link"
              type="url"
              required
              value={espnLink}
              onChange={(event) => setEspnLink(event.target.value)}
              placeholder="https://fantasy.espn.com/football/league?leagueId=..."
            />
          </div>
          <button type="submit" className="btn btn-primary">Open ESPN league</button>
          {espnError && <p role="alert" className="error-message">{espnError}</p>}
        </form>
      )}

      {savedLeagueError && (
        <p className="error-message" role="alert">
          {savedLeagueError}
        </p>
      )}

      {activeLeagueId && (
        <RosterSearch
          key={`${platform}:${activeLeagueId}`}
          leagueId={activeLeagueId}
          platform={platform}
          onSave={platform === "espn" && user
            ? (league) => handleSaveLeague({ ...league, league_id: activeLeagueId }, platform)
            : undefined}
          isSaved={savedLeagues.some((league) =>
            league.platform === platform && league.league_id === activeLeagueId)}
          saving={saving}
        />
      )}
    </section>
  );
}
