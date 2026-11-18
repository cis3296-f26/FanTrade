import { useEffect, useRef } from "react";
import "./PlayByPlayList.css";

function playTypeIcon(play) {
  if (play.touchdown) return "🏈";
  if (play.interception) return "INT";
  if (play.fumble_lost) return "FUM";
  if (play.sack) return "SCK";
  if (play.field_goal_result === "made") return "✓FG";
  if (play.field_goal_result === "missed" || play.field_goal_result === "blocked") return "✗FG";
  if (play.play_type === "punt") return "PUNT";
  if (play.play_type === "kickoff") return "KO";
  if (play.play_type === "extra_point") return "XP";
  if (play.play_type === "pass") return play.complete_pass ? "→" : "INC";
  if (play.play_type === "run") return "►";
  return "•";
}

function playTypeClass(play) {
  if (play.touchdown) return "pbp-item--td";
  if (play.interception || play.fumble_lost) return "pbp-item--turnover";
  if (play.sack) return "pbp-item--sack";
  if (play.field_goal_result === "made") return "pbp-item--fg-good";
  if (play.field_goal_result === "missed" || play.field_goal_result === "blocked") return "pbp-item--fg-bad";
  return "";
}

function yardageText(play) {
  const yg = play.yards_gained;
  if (yg == null) return "";
  if (yg > 0) return `+${yg}`;
  if (yg < 0) return `${yg}`;
  return "No gain";
}

export default function PlayByPlayList({ plays, currentIndex, rosterPlayerIds, onSeek }) {
  const listRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current && listRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentIndex]);

  if (!plays || plays.length === 0) {
    return <div className="pbp-empty">No plays loaded.</div>;
  }

  return (
    <div className="pbp-list" ref={listRef}>
      {plays.map((play, i) => {
        const isActive = i === currentIndex;
        const isRosterPlay = rosterPlayerIds && Object.keys(play.fantasy || {}).some((pid) => rosterPlayerIds.has(pid));
        const typeClass = playTypeClass(play);

        return (
          <button
            key={play.play_id || i}
            ref={isActive ? activeRef : null}
            className={`pbp-item ${typeClass}${isActive ? " pbp-item--active" : ""}${isRosterPlay ? " pbp-item--roster" : ""}`}
            onClick={() => onSeek(i)}
          >
            <div className="pbp-item-header">
              <span className="pbp-icon">{playTypeIcon(play)}</span>
              <span className="pbp-clock">Q{play.qtr} {play.game_clock}</span>
              {play.down && (
                <span className="pbp-down">{play.down}&amp;{play.ydstogo}</span>
              )}
              <span className="pbp-score">{play.away_score}–{play.home_score}</span>
            </div>
            <div className="pbp-desc">{play.desc}</div>
            {play.yards_gained !== null && play.yards_gained !== undefined && (
              <div className="pbp-yards">{yardageText(play)}</div>
            )}
            {isRosterPlay && (
              <div className="pbp-roster-badge">Your roster</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
