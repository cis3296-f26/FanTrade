import { useState, useRef } from "react";
import "./PlayerList.css";

const POSITIONS = ["WR", "TE", "RB"];
const DRAG_THRESHOLD = 6; // px

export default function PlayerList({ players, playerA, playerB, onAssign, onDragStart, onDragEnd }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");

  const dragRef = useRef(null); // { player, startX, startY, dragging }

  const usedIds = new Set([playerA?.id, playerB?.id].filter(Boolean));

  const filtered = players.filter((p) => {
    if (position && p.position !== position) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q);
    }
    return true;
  });

  function handlePointerDown(e, player) {
    if (e.button !== 0) return;
    dragRef.current = { player, startX: e.clientX, startY: e.clientY, dragging: false };
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
  }

  function handleWindowMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragRef.current.dragging = true;
      if (onDragStart) onDragStart(dragRef.current.player, e);
    }
  }

  function handleWindowUp(e) {
    if (!dragRef.current) return;
    const { player, dragging } = dragRef.current;
    dragRef.current = null;
    window.removeEventListener("pointermove", handleWindowMove);
    window.removeEventListener("pointerup", handleWindowUp);

    if (!dragging) {
      // Click: fill A → B → replace B
      onAssign(player, null);
    } else {
      if (onDragEnd) onDragEnd(player, e);
    }
  }

  function handleKeyDown(e, player) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAssign(player, null);
    }
  }

  return (
    <div className="player-list">
      <div className="player-list-filters">
        <input
          className="player-list-search"
          type="search"
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search players"
        />
        <select
          className="player-list-pos"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          aria-label="Filter by position"
        >
          <option value="">All</option>
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
      </div>

      <div className="player-list-scroll" role="listbox" aria-label="Player list">
        <div className="player-list-count">{filtered.length} player{filtered.length !== 1 ? "s" : ""}</div>
        {filtered.length === 0 ? (
          <div className="player-list-empty">No players match your search.</div>
        ) : (
          filtered.map((player) => {
            const disabled = usedIds.has(player.id);
            return (
              <div
                key={player.id}
                role="option"
                aria-selected={disabled}
                aria-disabled={disabled}
                tabIndex={disabled ? -1 : 0}
                className="player-list-row"
                onPointerDown={disabled ? undefined : (e) => handlePointerDown(e, player)}
                onKeyDown={disabled ? undefined : (e) => handleKeyDown(e, player)}
              >
                <img
                  className="player-row-avatar"
                  src={`https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                />
                <span className="player-row-name">{player.name}</span>
                <span className="player-row-meta">
                  <span className="player-row-team">{player.team}</span>
                  {player.position && <span className="player-row-pos">{player.position}</span>}
                </span>
              </div>
            );
          })
        )}
      </div>
      <p className="player-list-hint">Click a player to assign them. Drag to a slot.</p>
    </div>
  );
}
