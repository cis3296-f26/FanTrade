import { useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import TeamRoster from "./TeamRoster";
import "./RosterSearch.css";

// Use the same cleanup for both the query and the values being searched.
function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export default function RosterSearch({ leagueId }) {
  const [league, setLeague] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Increasing this number lets the user retry a failed request.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // If the user switches leagues, cancel the old browser request.
    const controller = new AbortController();

    async function loadRosters() {
      setLoading(true);
      setError("");
      setLeague(null);

      try {
        const data = await fetchJson(
          `/api/sleeper/rosters/${encodeURIComponent(leagueId)}`,
          { signal: controller.signal }
        );

        if (!Array.isArray(data.rosters)) {
          throw new Error("The server did not return valid roster data.");
        }

        // An old request shouldn't update a screen that's been replaced.
        if (!controller.signal.aborted) {
          setLeague(data);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRosters();

    // React runs this cleanup when the component leaves the page
    // or before this effect runs again.
    return () => controller.abort();
  }, [leagueId, attempt]);

  if (loading) {
    return <p role="status">Loading teams and player names...</p>;
  }

  if (error) {
    return (
      <div className="request-error">
        <p className="error-message" role="alert">
          {error}
        </p>

        <button
          type="button"
          onClick={() => setAttempt((current) => current + 1)}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!league) {
    return null;
  }

  const searchText = normalize(query);

  // The rosters are already loaded, so typing doesn't make more API calls.
  // A match in any of these fields keeps the team in the results.
  const matchingTeams = league.rosters.filter((team) => {
    const matchesTeam = normalize(team.team_name).includes(searchText);
    const matchesOwner = normalize(team.owner_name).includes(searchText);

    const matchesPlayer = (team.players ?? []).some((player) =>
      normalize(player.name).includes(searchText)
    );

    // An empty query matches every team, which also makes Clear work.
    return matchesTeam || matchesOwner || matchesPlayer;
  });

  return (
    <section
      className="roster-search"
      aria-labelledby="roster-search-heading"
    >
      <h2 id="roster-search-heading">{league.name}</h2>

      <p className="muted">
        Season {league.season} · Search within this league by team, owner,
        or player name.
      </p>

      <div className="search-controls">
        <div className="field">
          <label htmlFor="roster-query">Search teams and rosters</label>

          <input
            id="roster-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Team, owner, or player name"
            aria-describedby="search-help"
          />
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={!query}
          onClick={() => setQuery("")}
        >
          Clear
        </button>
      </div>

      <p id="search-help" className="muted">
        Searching a player shows the fantasy team that owns them.
        Open a team to view its full roster.
      </p>

      <p role="status" aria-live="polite">
        Showing {matchingTeams.length} of {league.rosters.length} teams
      </p>

      {/* An empty league and an unsuccessful search are different cases. */}
      {league.rosters.length === 0 ? (
        <p className="empty-message">
          This league has no rosters yet.
        </p>
      ) : matchingTeams.length === 0 ? (
        <p className="empty-message">
          No teams match “{query.trim()}”. Try another name or clear the search.
        </p>
      ) : (
        <div className="team-list">
          {matchingTeams.map((team) => {
            // Pass matching players along so the result can explain its match.
            const matchingPlayers = searchText
              ? (team.players ?? []).filter((player) =>
                  normalize(player.name).includes(searchText)
                )
              : [];

            return (
              <TeamRoster
                key={team.roster_id}
                team={team}
                matchingPlayers={matchingPlayers}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}