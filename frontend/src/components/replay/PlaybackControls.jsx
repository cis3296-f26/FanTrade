import { useEffect, useRef } from "react";
import "./PlaybackControls.css";

const SPEEDS = [1, 2, 4];

export default function PlaybackControls({
  playing, speed, playIndex, maxIndex, currentPlay,
  onPlay, onPause, onNext, onPrev, onSeek, onSpeedChange,
}) {
  const progressRef = useRef(null);

  // Keyboard controls
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); playing ? onPause() : onPlay(); }
      if (e.code === "ArrowRight") { e.preventDefault(); onNext(); }
      if (e.code === "ArrowLeft") { e.preventDefault(); onPrev(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, onPlay, onPause, onNext, onPrev]);

  function formatClock(play) {
    if (!play) return "–";
    return `Q${play.qtr || "?"} ${play.game_clock || "–"}`;
  }

  function downDistanceLabel(play) {
    if (!play || !play.down) return null;
    const d = play.down;
    const suffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
    const yl = play.yardline_100;
    const side = yl === null ? "" : yl > 50 ? `${play.posteam || ""} ${100 - (yl || 0)}` : `OPP ${yl}`;
    return `${d}${suffix} & ${play.ydstogo || "?"} — ${side}`;
  }

  const pct = maxIndex > 0 ? (playIndex / maxIndex) * 100 : 0;
  const dd = downDistanceLabel(currentPlay);

  return (
    <div className="playback-controls">
      {dd && (
        <div className="playback-down-distance">{dd}</div>
      )}

      {/* Progress scrubber */}
      <div className="playback-scrubber-row">
        <span className="playback-counter">{playIndex + 1} / {maxIndex + 1}</span>
        <input
          ref={progressRef}
          className="playback-scrubber"
          type="range"
          min={0}
          max={maxIndex}
          value={playIndex}
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{ "--pct": `${pct}%` }}
        />
        <span className="playback-clock">{formatClock(currentPlay)}</span>
      </div>

      {/* Buttons row */}
      <div className="playback-buttons">
        <button
          className="playback-btn"
          onClick={onPrev}
          disabled={playIndex === 0}
          aria-label="Previous play"
          title="Previous play (←)"
        >
          ⏮
        </button>

        <button
          className="playback-btn playback-btn--main"
          onClick={playing ? onPause : onPlay}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          {playing ? "⏸" : "▶"}
        </button>

        <button
          className="playback-btn"
          onClick={onNext}
          disabled={playIndex >= maxIndex}
          aria-label="Next play"
          title="Next play (→)"
        >
          ⏭
        </button>

        <div className="playback-speed-group">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`playback-speed-btn${speed === s ? " playback-speed-btn--active" : ""}`}
              onClick={() => onSpeedChange(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
