import { useState } from "react";
import { fetchJson } from "../lib/api";
import RosterSearch from "./RosterSearch";
import "./LeagueSearch.css";

export default function LeagueSearch() {
  // Keep the input, returned data, and request status separate.
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [leagueId, setLeagueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    // Handle the form here instead of letting the browser reload the page.
    event.preventDefault();

    const cleanUsername = username.trim();

    if (!cleanUsername || loading) {
      return;
    }

    // A new lookup clears the previous user's leagues and selected roster.
    setLoading(true);
    setError("");
    setProfile(null);
    setLeagueId("");

    try {
      // Encode the username so it can safely go into a URL.
      const data = await fetchJson(
        `/api/sleeper?username=${encodeURIComponent(cleanUsername)}`
      );

      // Make sure we received the data shape the dropdown needs.
      if (!Array.isArray(data.leagues)) {
        throw new Error("The server did not return a valid league list.");
      }

      setProfile(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      // Re-enable the form whether the request worked or failed.
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="league-search-heading">
      <h2 id="league-search-heading">Find your league</h2>

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
          disabled={loading || !username.trim()}
        >
          {loading ? "Finding leagues..." : "Find leagues"}
        </button>
      </form>

      {/* Status and alert roles help screen readers announce updates. */}
      {loading && <p role="status">Loading leagues from Sleeper...</p>}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {/* Only show the league selector after a successful lookup. */}
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

              <select
                id="league-select"
                value={leagueId}
                onChange={(event) => setLeagueId(event.target.value)}
              >
                <option value="">Select a league</option>

                {profile.leagues.map((league) => (
                  <option
                    key={league.league_id}
                    value={league.league_id}
                  >
                    {league.name} · {league.total_rosters} teams ·{" "}
                    {league.scoring_type}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Changing the key starts a fresh search for the selected league. */}
      {leagueId && (
        <RosterSearch key={leagueId} leagueId={leagueId} />
      )}
    </section>
  );
}