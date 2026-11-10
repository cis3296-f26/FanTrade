import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import useScrollReveal from "../../hooks/useScrollReveal";
import "./AvailablePlayersPage.css";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const TREND_TYPES = ["add", "drop"];

function formatPoints(value) {
  const points = Number(value);
  return value !== null && value !== undefined && Number.isFinite(points)
    ? points.toFixed(1)
    : "—";
}

export default function AvailablePlayersPage() {
  const { savedLeagues } = useAuth();
  const savedSleeperLeagues = savedLeagues.filter(
    (league) => league.platform === "sleeper"
  );
  const [username, setUsername] = useState("");
  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState("");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [players, setPlayers] = useState([]);
  const [activeTab, setActiveTab] = useState("available");
  const [trendType, setTrendType] = useState("add");
  const [lookbackHours, setLookbackHours] = useState("24");
  const [trendingPlayers, setTrendingPlayers] = useState([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [error, setError] = useState("");
  const [trendingError, setTrendingError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [trendingAttempt, setTrendingAttempt] = useState(0);

  useScrollReveal();

  const selectedLeague =
    leagues.find((league) => league.league_id === leagueId) ||
    savedSleeperLeagues.find((league) => league.league_id === leagueId);

  async function handleFindLeagues(event) {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || loadingLeagues) return;

    setLoadingLeagues(true);
    setError("");
    setLeagues([]);
    setLeagueId("");
    setPlayers([]);

    try {
      const data = await fetchJson(
        `/api/sleeper?username=${encodeURIComponent(cleanUsername)}`
      );
      if (!Array.isArray(data.leagues)) {
        throw new Error("The server did not return a valid league list.");
      }
      setLeagues(data.leagues);
      if (data.leagues.length === 0) {
        setError("No Sleeper leagues were found for that username this season.");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingLeagues(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "available" || !leagueId) {
      setLoadingPlayers(false);
      if (!leagueId) setPlayers([]);
      return undefined;
    }

    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      setLoadingPlayers(true);
      setError("");

      const params = new URLSearchParams();
      const cleanSearch = search.trim();
      if (cleanSearch) params.set("q", cleanSearch);
      if (position) params.set("position", position);
      const query = params.toString();
      const suffix = query ? `?${query}` : "";

      try {
        const data = await fetchJson(
          `/api/sleeper/available-players/${encodeURIComponent(leagueId)}${suffix}`,
          { signal: controller.signal }
        );
        if (!Array.isArray(data.players)) {
          throw new Error("The server did not return a valid player list.");
        }
        if (!controller.signal.aborted) setPlayers(data.players);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoadingPlayers(false);
      }
    }, search.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [activeTab, leagueId, position, search, attempt]);

  useEffect(() => {
    if (activeTab !== "trending") {
      setLoadingTrending(false);
      return undefined;
    }

    const controller = new AbortController();
    async function loadTrendingPlayers() {
      setLoadingTrending(true);
      setTrendingError("");

      try {
        const params = new URLSearchParams({
          lookback_hours: lookbackHours,
          limit: "25",
        });
        const data = await fetchJson(
          `/api/sleeper/trending/${trendType}?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!Array.isArray(data.players)) {
          throw new Error("The server did not return valid trending player data.");
        }
        if (!controller.signal.aborted) setTrendingPlayers(data.players);
      } catch (requestError) {
        if (!controller.signal.aborted) setTrendingError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoadingTrending(false);
      }
    }

    loadTrendingPlayers();
    return () => controller.abort();
  }, [activeTab, trendType, lookbackHours, trendingAttempt]);

  return (
    <div className="available-players-page">
      <main className="available-players-main reveal">
        <section aria-labelledby="available-players-heading">
          <h1 id="available-players-heading">Available players</h1>
          <p className="available-players-intro">
            Find unrostered players ranked by their expected weekly points, or see who is trending on Sleeper.
          </p>

          <div className="available-tabs" role="tablist" aria-label="Player lists">
            <button
              id="available-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "available"}
              aria-controls="available-panel"
              className={activeTab === "available" ? "available-tab active" : "available-tab"}
              onClick={() => setActiveTab("available")}
            >
              Available players
            </button>
            <button
              id="trending-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "trending"}
              aria-controls="trending-panel"
              className={activeTab === "trending" ? "available-tab active" : "available-tab"}
              onClick={() => setActiveTab("trending")}
            >
              Trending players
            </button>
          </div>

          <div
            id="available-panel"
            role="tabpanel"
            aria-labelledby="available-tab"
            hidden={activeTab !== "available"}
          >
              <form className="available-league-form" onSubmit={handleFindLeagues}>
            <div className="available-field">
              <label htmlFor="available-sleeper-username">Sleeper username</label>
              <input
                id="available-sleeper-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter a username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loadingLeagues}
                required
              />
            </div>
            <button type="submit" disabled={loadingLeagues || !username.trim()}>
              {loadingLeagues ? "Finding leagues..." : "Find leagues"}
            </button>
          </form>

          {savedSleeperLeagues.length > 0 && (
            <div className="available-field available-saved-leagues">
              <label htmlFor="available-saved-league">Or choose a saved league</label>
              <select
                id="available-saved-league"
                value={leagueId}
                onChange={(event) => {
                  setLeagueId(event.target.value);
                  setError("");
                  setAttempt((current) => current + 1);
                }}
              >
                <option value="">Select a saved league</option>
                {savedSleeperLeagues.map((league) => (
                  <option key={league.league_id} value={league.league_id}>
                    {league.league_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {leagues.length > 0 && (
            <div className="available-field available-league-select">
              <label htmlFor="available-league">Choose a league</label>
              <select
                id="available-league"
                value={leagueId}
                onChange={(event) => {
                  setLeagueId(event.target.value);
                  setError("");
                  setAttempt((current) => current + 1);
                }}
              >
                <option value="">Select a league</option>
                {leagues.map((league) => (
                  <option key={league.league_id} value={league.league_id}>
                    {league.name} · {league.total_rosters} teams · {league.scoring_type}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedLeague && (
            <p className="available-selected-league" role="status">
              Showing free agents for {selectedLeague.name || selectedLeague.league_name}
            </p>
          )}

          {!leagueId && error && (
            <p className="available-lookup-error" role="alert">
              {error}
            </p>
          )}

          {leagueId && (
            <>
              <div className="available-player-filters">
                <div className="available-field">
                  <label htmlFor="available-player-search">Search players</label>
                  <input
                    id="available-player-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by player name"
                  />
                </div>
                <div className="available-field">
                  <label htmlFor="available-position">Position</label>
                  <select
                    id="available-position"
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                  >
                    <option value="">All positions</option>
                    {POSITIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="available-projection-note">
                Players are ordered by Sleeper&apos;s expected weekly PPR points. Players without a projection appear last.
              </p>

              {loadingPlayers && <p role="status">Loading available players...</p>}
              {error && (
                <div className="available-error">
                  <p role="alert">{error}</p>
                  <button
                    type="button"
                    onClick={() => setAttempt((current) => current + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}

              {!loadingPlayers && !error && (
                <>
                  <p className="available-results-count" role="status" aria-live="polite">
                    Showing {players.length} available players
                    {players.length === 100 ? " · Search to find more" : ""}
                  </p>
                  {players.length === 0 ? (
                    <p className="available-empty">
                      No available players matched those filters.
                    </p>
                  ) : (
                    <div className="available-player-grid">
                      {players.map((player, index) => (
                        <article className="available-player-card" key={player.player_id}>
                          <span className="available-player-rank" aria-label={`Rank ${index + 1}`}>
                            {index + 1}
                          </span>
                          <div>
                            <h2>{player.name}</h2>
                            <p>
                              {player.position} <span aria-hidden="true">·</span>{" "}
                              {player.team}
                              {player.age ? ` · Age ${player.age}` : ""}
                            </p>
                          </div>
                          <span className="available-player-points">
                            {formatPoints(player.expected_points)}
                            <small>pts</small>
                          </span>
                          {player.injury_status !== "Healthy" && (
                            <span className="available-injury">
                              {player.injury_status}
                            </span>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                  <p className="available-note">
                    Player data is from Sleeper. Add players to your roster directly in Sleeper.
                  </p>
                </>
              )}
            </>
          )}
          </div>
          <div
            id="trending-panel"
            role="tabpanel"
            aria-labelledby="trending-tab"
            hidden={activeTab !== "trending"}
          >
              <p className="trending-description">
                See players most frequently added or dropped by Sleeper managers.
              </p>
              <div className="trending-controls">
                <div className="trending-type-toggle" role="group" aria-label="Trending activity">
                  {TREND_TYPES.map((type) => (
                    <button
                      type="button"
                      key={type}
                      className={trendType === type ? "trending-type active" : "trending-type"}
                      aria-pressed={trendType === type}
                      onClick={() => setTrendType(type)}
                    >
                      Trending {type === "add" ? "adds" : "drops"}
                    </button>
                  ))}
                </div>
                <div className="available-field trending-lookback">
                  <label htmlFor="trending-lookback">Activity window</label>
                  <select
                    id="trending-lookback"
                    value={lookbackHours}
                    onChange={(event) => setLookbackHours(event.target.value)}
                  >
                    <option value="4">Last 4 hours</option>
                    <option value="24">Last 24 hours</option>
                    <option value="72">Last 3 days</option>
                  </select>
                </div>
              </div>

              {loadingTrending && <p role="status">Loading trending players...</p>}
              {trendingError && (
                <div className="available-error">
                  <p role="alert">{trendingError}</p>
                  <button
                    type="button"
                    onClick={() => setTrendingAttempt((current) => current + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {!loadingTrending && !trendingError && (
                trendingPlayers.length === 0 ? (
                  <p className="available-empty">Sleeper has no trending players for this time window.</p>
                ) : (
                  <div className="available-player-grid">
                    {trendingPlayers.map((player, index) => (
                      <article className="available-player-card" key={player.player_id}>
                        <span className="available-player-rank" aria-label={`Rank ${index + 1}`}>
                          {index + 1}
                        </span>
                        <div>
                          <h2>{player.name}</h2>
                          <p>{player.position} <span aria-hidden="true">·</span> {player.team}</p>
                        </div>
                        <span className="trending-count">
                          {player.count}
                          <small>{trendType === "add" ? "adds" : "drops"}</small>
                        </span>
                      </article>
                    ))}
                  </div>
                )
              )}
              <p className="available-note">
                Trending data is provided by Sleeper&apos;s public API.
              </p>
            </div>
        </section>
      </main>
    </div>
  );
}
