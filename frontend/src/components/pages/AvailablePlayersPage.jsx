import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import useScrollReveal from "../../hooks/useScrollReveal";
import Select, { SelectItem } from "../ui/Select";
import "./AvailablePlayersPage.css";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const TREND_TYPES = ["add", "drop"];

function formatPoints(value) {
  const points = Number(value);
  return value !== null && value !== undefined && Number.isFinite(points)
    ? points.toFixed(1)
    : "—";
}

function formatRank(value) {
  const rank = Number(value);
  return Number.isInteger(rank) && rank > 0 ? `#${rank}` : "—";
}

function PlayerAvatar({ player, className }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const avatarUrl = player?.avatar_url;
  const showImage = Boolean(avatarUrl && failedUrl !== avatarUrl);

  const initials = (player?.name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <span className={className} aria-hidden="true">
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}

export default function AvailablePlayersPage() {
  const { savedLeagues } = useAuth();
  const [searchParams] = useSearchParams();
  const espnReference = searchParams.get("espn") ?? "";
  const [openedEspnLeague, setOpenedEspnLeague] = useState(
    /^\d{4}:\d+$/.test(espnReference) ? espnReference : ""
  );
  const leagueOptions = savedLeagues.filter(({ platform }) => ["sleeper", "espn"].includes(platform));
  if (openedEspnLeague && !leagueOptions.some(({ league_id }) => league_id === openedEspnLeague)) {
    leagueOptions.unshift({ league_id: openedEspnLeague, league_name: "Opened league", platform: "espn" });
  }
  const [leagueSearch, setLeagueSearch] = useState("");
  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState(openedEspnLeague);
  const [availability, setAvailability] = useState("");
  const isEspn = /^\d{4}:\d+$/.test(leagueId);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [players, setPlayers] = useState([]);
  const [activeTab, setActiveTab] = useState("available");
  const [trendType, setTrendType] = useState("add");
  const [lookbackHours, setLookbackHours] = useState("24");
  const [trendingPlayers, setTrendingPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerContext, setSelectedPlayerContext] = useState("");
  const [playerDetails, setPlayerDetails] = useState(null);
  const [loadingPlayerDetails, setLoadingPlayerDetails] = useState(false);
  const [playerDetailsError, setPlayerDetailsError] = useState("");
  const [playerDetailsAttempt, setPlayerDetailsAttempt] = useState(0);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [error, setError] = useState("");
  const [trendingError, setTrendingError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [trendingAttempt, setTrendingAttempt] = useState(0);
  const playerDialogRef = useRef(null);

  useScrollReveal();

  useEffect(() => {
    const dialog = playerDialogRef.current;
    if (!dialog) return;

    if (selectedPlayer && !dialog.open) {
      dialog.showModal();
    } else if (!selectedPlayer && dialog.open) {
      dialog.close();
    }
  }, [selectedPlayer]);

  useEffect(() => {
    if (!selectedPlayer || selectedPlayerContext !== "trending") return undefined;

    const controller = new AbortController();
    async function loadPlayerDetails() {
      try {
        const data = await fetchJson(
          `/api/sleeper/players/${encodeURIComponent(selectedPlayer.player_id)}/details`,
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) setPlayerDetails(data);
      } catch (requestError) {
        if (!controller.signal.aborted) setPlayerDetailsError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoadingPlayerDetails(false);
      }
    }

    loadPlayerDetails();
    return () => controller.abort();
  }, [selectedPlayer, selectedPlayerContext, playerDetailsAttempt]);

  const selectedLeague =
    leagues.find((league) => league.league_id === leagueId) ||
    leagueOptions.find((league) => league.league_id === leagueId);
  const sleeperSearch = isEspn ? "" : search;
  const sleeperPosition = isEspn ? "" : position;
  const filteredPlayers = isEspn
    ? players.filter((player) =>
        (!availability || player.availability === availability) &&
        (!position || player.position === position) &&
        player.name.toLowerCase().includes(search.trim().toLowerCase()))
    : players;
  const visiblePlayers = filteredPlayers.slice(0, 100);

  function selectLeague(value) {
    setLeagueId(value);
    setPlayers([]);
    setAvailability("");
    setError("");
    setAttempt((current) => current + 1);
  }

  async function handleFindLeagues(event) {
    event.preventDefault();
    const input = leagueSearch.trim();
    if (!input || loadingLeagues) return;

    if (/^https?:|[./]espn\.com|^fantasy\.espn\.com/i.test(input)) {
      try {
        const url = new URL(input.startsWith("fantasy.espn.com/") ? `https://${input}` : input);
        const id = url.searchParams.get("leagueId");
        const today = new Date();
        const season = url.searchParams.get("seasonId") ??
          String(today.getFullYear() - Number(today.getMonth() < 7));
        if (url.origin !== "https://fantasy.espn.com" ||
            url.pathname.replace(/\/$/, "") !== "/football/league" ||
            !/^\d+$/.test(id ?? "") || !/^\d{4}$/.test(season)) {
          throw new Error();
        }

        const reference = `${season}:${id}`;
        setOpenedEspnLeague(reference);
        selectLeague(reference);
      } catch {
        selectLeague("");
        setError("Enter a public ESPN Fantasy Football League Office link.");
      }
      return;
    }

    setLoadingLeagues(true);
    setError("");
    setLeagues([]);
    setLeagueId("");
    setPlayers([]);

    try {
      const data = await fetchJson(
        `/api/sleeper?username=${encodeURIComponent(input)}`
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
      const cleanSearch = sleeperSearch.trim();
      if (cleanSearch) params.set("q", cleanSearch);
      if (sleeperPosition) params.set("position", sleeperPosition);
      const query = params.toString();
      const suffix = query ? `?${query}` : "";

      try {
        const [season, espnId] = isEspn ? leagueId.split(":") : [];
        const url = isEspn
          ? `/api/espn/available-players/${encodeURIComponent(espnId)}?season=${encodeURIComponent(season)}`
          : `/api/sleeper/available-players/${encodeURIComponent(leagueId)}${suffix}`;
        const data = await fetchJson(url, { signal: controller.signal });
        if (!Array.isArray(data.players)) {
          throw new Error("The server did not return a valid player list.");
        }
        if (!controller.signal.aborted) setPlayers(data.players);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoadingPlayers(false);
      }
    }, sleeperSearch.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [activeTab, leagueId, isEspn, sleeperPosition, sleeperSearch, attempt]);

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

  function openPlayerDetails(player, context) {
    setSelectedPlayer(player);
    setSelectedPlayerContext(context);
    setPlayerDetails(null);
    setPlayerDetailsError("");
    setLoadingPlayerDetails(context === "trending");
    if (context === "trending") {
      setPlayerDetailsAttempt((current) => current + 1);
    }
  }

  return (
    <div className="available-players-page">
      <main className="available-players-main reveal">
        <section aria-labelledby="available-players-heading">
          <h1 id="available-players-heading">Available Players</h1>
          <p className="available-players-intro">
            Find free agents and waiver players for your league, or see who is trending on Sleeper.
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
              <label htmlFor="available-league-search">Sleeper username or public ESPN league link</label>
              <input
                id="available-league-search"
                value={leagueSearch}
                onChange={(event) => setLeagueSearch(event.target.value)}
                placeholder="Enter a Sleeper username or paste an ESPN league link"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loadingLeagues}
                required
              />
            </div>
            <button type="submit" disabled={loadingLeagues || !leagueSearch.trim()}>
              {loadingLeagues ? "Finding leagues..." : "Find leagues"}
            </button>
          </form>

          {leagueOptions.length > 0 && (
            <div className="available-field available-saved-leagues">
              <label htmlFor="available-saved-league">Choose a saved or opened league</label>
              <Select
                id="available-saved-league"
                value={leagueOptions.some((league) => league.league_id === leagueId) ? leagueId : ""}
                onChange={(val) => selectLeague(val)}
                placeholder="Select a league"
              >
                {leagueOptions.map((league) => (
                  <SelectItem key={league.league_id} value={league.league_id}>
                    {league.league_name}{league.platform === "espn" ? " · ESPN" : ""}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}

          {leagues.length > 0 && (
            <div className="available-field available-league-select">
              <label htmlFor="available-league">Choose a league</label>
              <Select
                id="available-league"
                value={leagues.some((league) => league.league_id === leagueId) ? leagueId : ""}
                onChange={(val) => selectLeague(val)}
                placeholder="Select a league"
              >
                {leagues.map((league) => (
                  <SelectItem key={league.league_id} value={league.league_id}>
                    {league.name} · {league.total_rosters} teams · {league.scoring_type}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}

          {selectedLeague && (
            <p className="available-selected-league" role="status">
              Showing {isEspn ? "available players" : "free agents"} for {selectedLeague.name || selectedLeague.league_name}
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
                  <Select
                    id="available-position"
                    value={position}
                    onChange={setPosition}
                    placeholder="All positions"
                  >
                    <SelectItem value="">All positions</SelectItem>
                    {POSITIONS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
                {isEspn && (
                  <div className="available-field">
                    <label htmlFor="available-status">Availability</label>
                    <select id="available-status" value={availability}
                      onChange={(event) => setAvailability(event.target.value)}>
                      <option value="">All available players</option>
                      <option value="FREEAGENT">Free agents</option>
                      <option value="WAIVERS">On waivers</option>
                    </select>
                  </div>
                )}
              </div>

              {isEspn && (
                <button type="button" className="btn btn-secondary" disabled={loadingPlayers}
                  onClick={() => setAttempt((current) => current + 1)}>
                  Refresh available players
                </button>
              )}
              <p className="available-projection-note">
                {isEspn
                  ? "Ordered by ESPN roster percentage."
                  : "Players are ordered by Sleeper's expected weekly PPR points. Players without a projection appear last."}
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
                    Showing {visiblePlayers.length} available players
                    {filteredPlayers.length > visiblePlayers.length
                      ? ` of ${filteredPlayers.length} · Search to find more`
                      : !isEspn && visiblePlayers.length === 100 ? " · Search to find more" : ""}
                  </p>
                  {visiblePlayers.length === 0 ? (
                    <p className="available-empty">
                      No available players matched those filters.
                    </p>
                  ) : (
                    <div className="available-player-grid">
                      {visiblePlayers.map((player, index) => (
                        <button
                          className="available-player-card available-player-card-button"
                          key={player.player_id}
                          type="button"
                          aria-label={`Rank ${index + 1}: view ${player.name} photo and details`}
                          onClick={() => openPlayerDetails(player, "available")}
                        >
                          <PlayerAvatar
                            player={player}
                            className="available-player-avatar"
                          />
                          <span className="available-player-identity">
                            <span
                              className="available-player-name"
                              role="heading"
                              aria-level="2"
                            >
                              {player.name}
                            </span>
                            <span className="available-player-meta">
                              {player.position} <span aria-hidden="true">·</span>{" "}
                              {player.team}
                              {player.age ? ` · Age ${player.age}` : ""}
                            </span>
                            {isEspn && (
                              <span className="available-player-meta">
                                {player.availability === "WAIVERS" ? "On waivers" : "Free agent"}
                                {player.waiver_process_date
                                  ? ` · Clears ${new Date(player.waiver_process_date).toLocaleString([], {
                                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                                    })}`
                                  : ""}
                              </span>
                            )}
                          </span>
                          <span className="available-player-points">
                            {isEspn && typeof player.percent_rostered === "number"
                              ? `${formatPoints(player.percent_rostered)}%`
                              : formatPoints(player.expected_points)}
                            <small>{isEspn ? "rostered" : "pts"}</small>
                          </span>
                          {player.injury_status !== "Healthy" && (
                            <span className="available-injury">
                              {player.injury_status}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="available-note">
                    {isEspn ? "Add players or submit waiver claims in ESPN." : "Add players to your roster directly in Sleeper."}
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
                  <Select
                    id="trending-lookback"
                    value={lookbackHours}
                    onChange={setLookbackHours}
                  >
                    <SelectItem value="4">Last 4 hours</SelectItem>
                    <SelectItem value="24">Last 24 hours</SelectItem>
                    <SelectItem value="72">Last 3 days</SelectItem>
                  </Select>
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
                      <button
                        className="available-player-card trending-player-card"
                        key={player.player_id}
                        type="button"
                        aria-label={`Rank ${index + 1}: view ${player.name} details`}
                        onClick={() => openPlayerDetails(player, "trending")}
                      >
                        <PlayerAvatar
                          player={player}
                          className="available-player-avatar trending-player-avatar"
                        />
                        <span className="available-player-identity">
                          <span className="available-player-name">{player.name}</span>
                          <span className="available-player-meta">
                            {player.position} <span aria-hidden="true">·</span> {player.team}
                          </span>
                        </span>
                        <span className={`trending-count trending-count-${trendType}`}>
                          {player.count}
                          <small>{trendType === "add" ? "adds" : "drops"}</small>
                        </span>
                      </button>
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
      <dialog
        ref={playerDialogRef}
        className="trending-player-dialog"
        aria-labelledby="player-dialog-title"
        onClose={() => setSelectedPlayer(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        {selectedPlayer && (
          <div className="trending-player-dialog-content">
            <button
              className="trending-player-dialog-close"
              type="button"
              aria-label="Close player details"
              onClick={() => playerDialogRef.current?.close()}
            >
              ×
            </button>
            <PlayerAvatar
              player={selectedPlayer}
              className="trending-player-dialog-photo"
            />
            <div className="trending-player-dialog-details">
              <p className="trending-player-dialog-label">
                {selectedPlayerContext === "trending" ? "Player profile" : "Available player"}
              </p>
              <h2 id="player-dialog-title">{selectedPlayer.name}</h2>
              <p className="trending-player-dialog-meta">
                {selectedPlayer.position}
                <span aria-hidden="true"> · </span>
                {selectedPlayer.team}
                {selectedPlayer.age ? ` · Age ${selectedPlayer.age}` : ""}
              </p>
              {selectedPlayerContext === "trending" ? (
                <p className="trending-player-dialog-activity">
                  Trending {trendType === "add" ? "adds" : "drops"}
                  <strong>{selectedPlayer.count}</strong>
                </p>
              ) : isEspn ? (
                <>
                  <p className="trending-player-dialog-activity">
                    Rostered
                    <strong>
                      {typeof selectedPlayer.percent_rostered === "number"
                        ? `${formatPoints(selectedPlayer.percent_rostered)}%`
                        : "—"}
                    </strong>
                  </p>
                  {selectedPlayer.availability && (
                    <p className="trending-player-dialog-activity">
                      Status
                      <strong>
                        {selectedPlayer.availability === "WAIVERS" ? "On waivers" : "Free agent"}
                        {selectedPlayer.waiver_process_date
                          ? ` · Clears ${new Date(selectedPlayer.waiver_process_date).toLocaleString([], {
                              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                            })}`
                          : ""}
                      </strong>
                    </p>
                  )}
                </>
              ) : (
                <p className="trending-player-dialog-activity">
                  Expected points
                  <strong>{formatPoints(selectedPlayer.expected_points)} pts</strong>
                </p>
              )}
            </div>
          </div>
        )}
        {selectedPlayerContext === "trending" && loadingPlayerDetails && (
          <p className="trending-player-details-status" role="status">
            Loading player stats from Sleeper...
          </p>
        )}
        {selectedPlayerContext === "trending" && playerDetailsError && (
          <div className="trending-player-details-error">
            <p role="alert">{playerDetailsError}</p>
            <button
              type="button"
              onClick={() => {
                setPlayerDetailsError("");
                setLoadingPlayerDetails(true);
                setPlayerDetailsAttempt((current) => current + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}
        {selectedPlayerContext === "trending" && playerDetails && (
          <div className="trending-player-stats">
            <div className="trending-player-stat-grid">
              <div className="trending-player-stat">
                <span>Expected points</span>
                <strong>{formatPoints(playerDetails.expected_points)}</strong>
                <small>This week · PPR</small>
              </div>
              <div className="trending-player-stat">
                <span>Fantasy rank</span>
                <strong>{formatRank(playerDetails.fantasy_rank)}</strong>
                <small>Season-to-date · PPR</small>
              </div>
              <div className="trending-player-stat">
                <span>Sleeper search rank</span>
                <strong>{formatRank(playerDetails.search_rank)}</strong>
                <small>Search popularity</small>
              </div>
            </div>
            <section className="trending-player-game-log" aria-labelledby="trending-player-game-log-title">
              <h3 id="trending-player-game-log-title">Recent game log</h3>
              {playerDetails.game_log.length > 0 ? (
                <div className="trending-player-game-log-list">
                  {playerDetails.game_log.map((game) => (
                    <div className="trending-player-game-log-row" key={game.week}>
                      <span>Week {game.week}</span>
                      <strong>{formatPoints(game.points)} pts</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="trending-player-game-log-empty">
                  No recent game log is available from Sleeper.
                </p>
              )}
            </section>
          </div>
        )}
      </dialog>
    </div>
  );
}
