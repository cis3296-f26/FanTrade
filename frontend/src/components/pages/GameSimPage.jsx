import { useState } from "react";
import useScrollReveal from "../../hooks/useScrollReveal";
import GameSelector from "../replay/GameSelector";
import GameReplayScene from "../replay/GameReplayScene";
import PlaybackControls from "../replay/PlaybackControls";
import PlayByPlayList from "../replay/PlayByPlayList";
import FantasyPanel from "../replay/FantasyPanel";
import useReplayEngine from "../replay/useReplayEngine";
import "./GameSimPage.css";

function ScoreboardBar({ game, currentPlay, homeTeam, awayTeam }) {
  if (!game) return null;
  const hs = currentPlay?.home_score ?? game.home_score ?? 0;
  const as_ = currentPlay?.away_score ?? game.away_score ?? 0;
  const qtr = currentPlay?.qtr ? `Q${currentPlay.qtr}` : "FINAL";
  const clock = currentPlay?.game_clock || "";

  return (
    <div className="scoreboard-bar">
      <div className="scoreboard-team">
        <span className="scoreboard-abbr">{awayTeam}</span>
        <span className="scoreboard-score">{as_}</span>
      </div>
      <div className="scoreboard-mid">
        <span className="scoreboard-qtr">{qtr}</span>
        {clock && <span className="scoreboard-clock">{clock}</span>}
      </div>
      <div className="scoreboard-team scoreboard-team--home">
        <span className="scoreboard-score">{hs}</span>
        <span className="scoreboard-abbr">{homeTeam}</span>
      </div>
    </div>
  );
}

export default function GameSimPage() {
  useScrollReveal();
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [loadingGame, setLoadingGame] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [rosterIds, setRosterIds] = useState(new Set());

  const plays = gameData?.plays || [];
  const engine = useReplayEngine(plays, null);

  function handleSelectGame(meta) {
    setSelectedMeta(meta);
    setLoadingGame(true);
    setLoadError(null);
    setGameData(null);

    fetch(`/data/game-replays/${meta.filename}`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load game data.");
        return r.json();
      })
      .then((data) => { setGameData(data); setLoadingGame(false); })
      .catch((e) => { setLoadError(e.message); setLoadingGame(false); });
  }

  function handleBack() {
    setSelectedMeta(null);
    setGameData(null);
    setLoadError(null);
    engine.controls.pause();
  }

  const homeTeam = gameData?.home_team || selectedMeta?.home_team || "";
  const awayTeam = gameData?.away_team || selectedMeta?.away_team || "";

  return (
    <div className="game-sim-page">
      <main className="game-sim-main reveal">
        {!selectedMeta ? (
          /* ── Game selection view ── */
          <div className="game-sim-selector-view">
            <GameSelector onSelect={handleSelectGame} />
          </div>
        ) : (
          /* ── Replay view ── */
          <div className="game-sim-replay-view">
            <div className="game-sim-replay-header">
              <button className="btn btn-ghost btn-sm game-sim-back-btn" onClick={handleBack}>
                ← All Games
              </button>
              <span className="game-sim-game-title">
                {awayTeam} @ {homeTeam} — Week {selectedMeta.week}, {selectedMeta.season}
              </span>
            </div>

            {loadingGame && (
              <div className="game-sim-loading">
                <div className="game-sim-spinner" />
                <p>Loading game data…</p>
              </div>
            )}

            {loadError && (
              <div className="game-sim-error">
                <p>{loadError}</p>
                <button className="btn btn-secondary btn-sm" onClick={() => handleSelectGame(selectedMeta)}>
                  Retry
                </button>
              </div>
            )}

            {gameData && (
              <div className="game-sim-layout">
                {/* Left: 3D scene + controls */}
                <div className="game-sim-left">
                  <ScoreboardBar
                    game={gameData}
                    currentPlay={engine.currentPlay}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                  />

                  <GameReplayScene
                    game={gameData}
                    playIndex={engine.playIndex}
                    playing={engine.playing}
                    speed={engine.speed}
                    spotlightIds={rosterIds}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                  />

                  <PlaybackControls
                    playing={engine.playing}
                    speed={engine.speed}
                    playIndex={engine.playIndex}
                    maxIndex={engine.maxIndex}
                    currentPlay={engine.currentPlay}
                    onPlay={engine.controls.play}
                    onPause={engine.controls.pause}
                    onNext={engine.controls.nextPlay}
                    onPrev={engine.controls.prevPlay}
                    onSeek={engine.controls.seekTo}
                    onSpeedChange={engine.controls.setSpeed}
                  />
                </div>

                {/* Right: play-by-play + fantasy panel */}
                <div className="game-sim-right">
                  <div className="game-sim-pbp-section">
                    <h3 className="game-sim-section-title">Play by Play</h3>
                    <PlayByPlayList
                      plays={plays}
                      currentIndex={engine.playIndex}
                      rosterPlayerIds={rosterIds}
                      onSeek={engine.controls.seekTo}
                    />
                  </div>

                  <FantasyPanel
                    game={gameData}
                    plays={plays}
                    playIndex={engine.playIndex}
                    fantasyTotals={engine.fantasyTotals}
                    onRosterIdsChange={setRosterIds}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
