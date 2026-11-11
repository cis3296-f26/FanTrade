import { useState, useEffect, useRef, useCallback } from "react";
import * as Slider from "@radix-ui/react-slider";
import { fetchJson } from "../../lib/api";
import FieldScene from "./FieldScene";
import PlayerList from "./PlayerList";
import StatsPanel from "./StatsPanel";
import "./TargetMap.css";

// ── Simulation constants ───────────────────────────────────────────────────
const LANE_CENTERS_X = [-LANE_W(), 0, LANE_W()];

function LANE_W() { return 53.3 / 3; }

const BAND_RANGES = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 40]];

function weightedRandom(shares) {
  const total = shares.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < shares.length; i++) {
    r -= shares[i];
    if (r <= 0) return i;
  }
  return shares.length - 1;
}

function cellToLandingPos(cellIndex) {
  const lane = Math.floor(cellIndex / 6);
  const band = cellIndex % 6;
  const [start, end] = BAND_RANGES[band];
  const depth = start + (end - start) * (0.15 + Math.random() * 0.7);
  const laneCenter = LANE_CENTERS_X[lane];
  const laneJitter = (53.3 / 3) * 0.3 * (Math.random() * 2 - 1);
  return { x: laneCenter + laneJitter, z: -depth };
}

const HOME_POS = {
  A: { x: -5, z: 4 },
  B: { x: 5, z: 4 },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function TargetMap() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);

  const [simActive, setSimActive] = useState(false);
  const [simPaused, setSimPaused] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const simSpeedRef = useRef(1);
  useEffect(() => { simSpeedRef.current = simSpeed; }, [simSpeed]);
  const [throwCount, setThrowCount] = useState(24);
  const [throwCaption, setThrowCaption] = useState("");
  const [simState, setSimState] = useState(null); // { countsA, countsB, throwsA, throwsB }

  const simRef = useRef(null); // mutable sim state that lives across animation frames
  const throwCountRef = useRef(throwCount);
  useEffect(() => { throwCountRef.current = throwCount; }, [throwCount]);

  // Drag state for slot drop targets
  const [dragPlayer, setDragPlayer] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // 'A' | 'B' | null

  const prefersReducedMotion = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Throw animation state passed to FieldScene
  const [throwAnim, setThrowAnim] = useState(null);

  // ── Data fetch ──
  useEffect(() => {
    let cancelled = false;
    fetchJson("/api/usage-field/players")
      .then((data) => { if (!cancelled) setPlayers(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Player assignment ──
  function assignPlayerDirect(player, slot) {
    if (slot === "A") {
      if (playerB?.id === player.id) {
        setPlayerA(player);
        setPlayerB(playerA);
      } else {
        setPlayerA(player);
      }
    } else if (slot === "B") {
      if (playerA?.id === player.id) {
        setPlayerA(playerB);
        setPlayerB(player);
      } else {
        setPlayerB(player);
      }
    } else {
      // Click without slot: fill A, then B, then replace B
      if (!playerA) {
        setPlayerA(player);
      } else if (!playerB) {
        setPlayerB(player);
      } else {
        setPlayerB(player);
      }
    }
    cancelSim();
  }

  function clearSlot(slot) {
    if (slot === "A") setPlayerA(null);
    else setPlayerB(null);
    cancelSim();
  }

  // ── Simulation ──
  function cancelSim() {
    setSimActive(false);
    setSimPaused(false);
    setThrowCaption("");
    setSimState(null);
    setThrowAnim(null);
    simRef.current = null;
  }

  function startSim() {
    if (!playerA && !playerB) return;
    setSimActive(true);
    setSimPaused(false);
    setThrowCaption("Simulating…");

    const countsA = new Array(18).fill(0);
    const countsB = new Array(18).fill(0);

    simRef.current = {
      phase: "rest",       // rest | fly | done
      throwIndex: 0,       // 0..23
      throwsA: 0,
      throwsB: 0,
      countsA,
      countsB,
      phaseElapsed: 0,
      flyDuration: 0,
      currentSlot: null,
      landingPos: null,
      receiverStart: null,
      receiverTarget: null,
      receiverPos: { A: { ...HOME_POS.A }, B: { ...HOME_POS.B } },
    };

    setSimState({ countsA: [...countsA], countsB: [...countsB], throwsA: 0, throwsB: 0 });
  }

  const handleAnimFrame = useCallback((dt) => {
    const sim = simRef.current;
    if (!sim || sim.phase === "done") return;

    sim.phaseElapsed += dt * simSpeedRef.current;

    const p = prefersReducedMotion.current;

    if (sim.phase === "rest") {
      const restDuration = p ? 0 : 0.45;
      if (sim.phaseElapsed >= restDuration) {
        // Pick next throw
        const throwIdx = sim.throwIndex;
        if (throwIdx >= throwCountRef.current) {
          sim.phase = "done";
          setSimActive(false);
          setThrowCaption(`Done — ${throwCountRef.current} throws complete.`);
          setThrowAnim(null);
          return;
        }

        // Alternate A/B; if only one player, all throws go to that player
        let slot;
        if (!playerA) slot = "B";
        else if (!playerB) slot = "A";
        else slot = throwIdx % 2 === 0 ? "A" : "B";

        const player = slot === "A" ? playerA : playerB;
        const cellIndex = weightedRandom(player.shares);
        const landing = cellToLandingPos(cellIndex);

        const lane = Math.floor(cellIndex / 6);
        const band = cellIndex % 6;
        const laneLabel = ["left", "middle", "right"][lane];
        const bandLabel = ["0–5", "5–10", "10–15", "15–20", "20–30", "30+"][band];
        const depth = BAND_RANGES[band][0];

        const flyDuration = p ? 0 : 0.55 + depth * 0.009;

        sim.currentSlot = slot;
        sim.landingPos = landing;
        sim.receiverStart = { ...sim.receiverPos[slot] };
        sim.receiverTarget = landing;
        sim.flyDuration = flyDuration;
        sim.phaseElapsed = 0;
        sim.phase = "fly";
        sim.currentCell = cellIndex;

        const shortName = player.name.split(".").pop() || player.name;
        setThrowCaption(`Throw ${throwIdx + 1} of ${throwCountRef.current}: to ${shortName}, ${laneLabel}, ${bandLabel} yds`);

        setThrowAnim({
          slot,
          receiverStart: sim.receiverStart,
          receiverTarget: landing,
          landingPos: landing,
          elapsed: 0,
          duration: flyDuration,
          reducedMotion: p,
        });
      }
    } else if (sim.phase === "fly") {
      // Update elapsed on the anim object
      setThrowAnim((prev) => prev ? { ...prev, elapsed: sim.phaseElapsed } : prev);

      if (sim.phaseElapsed >= sim.flyDuration) {
        // Catch!
        const { currentSlot, currentCell, countsA, countsB } = sim;
        if (currentSlot === "A") {
          countsA[currentCell]++;
          sim.throwsA++;
        } else {
          countsB[currentCell]++;
          sim.throwsB++;
        }

        // Update receiver home to landing
        sim.receiverPos[currentSlot] = { ...sim.landingPos };

        sim.throwIndex++;
        sim.phaseElapsed = 0;
        sim.phase = "rest";
        setThrowAnim(null);

        setSimState({
          countsA: [...countsA],
          countsB: [...countsB],
          throwsA: sim.throwsA,
          throwsB: sim.throwsB,
        });
      }
    }
  // playerA/playerB are stable refs in the sim — they're captured at sim start
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerA, playerB]);

  // ── Drag handlers ──
  function handleDragStart(player, _e) {
    setDragPlayer(player);
  }
  function handleDragEnd(player, e) {
    setDragPlayer(null);
    setDropTarget(null);
    // Determine if pointer is over a slot
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const slotEl = el.closest("[data-slot]");
    if (slotEl) {
      assignPlayerDirect(player, slotEl.dataset.slot);
    }
  }

  // ── Slot pointer events for drop highlighting ──
  function onSlotPointerEnter(slot) {
    if (dragPlayer) setDropTarget(slot);
  }
  function onSlotPointerLeave() {
    setDropTarget(null);
  }

  if (loading) {
    return (
      <div className="target-map">
        <div className="target-map-loading">Loading player data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="target-map">
        <div className="target-map-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="target-map">
      <header className="target-map-header">
        <h1>Target Map</h1>
        <p>Compare where two receivers get targeted on the field — by lane and depth, drawn from 2025 regular-season play-by-play data.</p>
      </header>

      {/* Aria live region for simulation captions */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" style={{ position: "absolute", left: "-9999px" }}>
        {throwCaption}
      </div>

      <div className="target-map-body">
        {/* ── Left column ── */}
        <div className="target-map-left">
          {/* Slots */}
          <div className="target-map-slots">
            {["A", "B"].map((slot) => {
              const player = slot === "A" ? playerA : playerB;
              const filled = !!player;
              return (
                <div
                  key={slot}
                  data-slot={slot}
                  className={[
                    "target-map-slot",
                    `target-map-slot--${slot.toLowerCase()}`,
                    filled ? "target-map-slot--filled" : "",
                    dropTarget === slot ? "target-map-slot--drop-target" : "",
                  ].join(" ")}
                  onPointerEnter={() => onSlotPointerEnter(slot)}
                  onPointerLeave={onSlotPointerLeave}
                >
                  <span className="slot-label">{slot}</span>
                  {filled ? (
                    <div className="slot-player">
                      <img
                        className="slot-avatar"
                        src={`https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`}
                        alt=""
                        aria-hidden="true"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                      <div className="slot-player-text">
                        <span className="slot-player-name">{player.name}</span>
                        <span className="slot-player-team">{player.team}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="slot-empty-hint">Drop or click a player</span>
                  )}
                  {filled && (
                    <button
                      className="slot-clear"
                      aria-label={`Remove ${player.name} from slot ${slot}`}
                      onClick={() => clearSlot(slot)}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Field */}
          <FieldScene
            playerA={playerA}
            playerB={playerB}
            simState={simState}
            throwAnim={throwAnim}
            onAnimFrame={(simActive && !simPaused) ? handleAnimFrame : null}
          />

          {/* Controls */}
          <div className="target-map-controls">
            {!simActive && (
              <label className="target-map-throw-label">
                <span className="target-map-throw-count">Throws: {throwCount}</span>
                <Slider.Root
                  className="target-map-slider-root"
                  min={6}
                  max={100}
                  step={2}
                  value={[throwCount]}
                  onValueChange={([v]) => setThrowCount(v)}
                  aria-label="Number of throws to simulate"
                >
                  <Slider.Track className="target-map-slider-track">
                    <Slider.Range className="target-map-slider-range" />
                  </Slider.Track>
                  <Slider.Thumb className="target-map-slider-thumb" />
                </Slider.Root>
              </label>
            )}
            {!simActive ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={startSim}
                disabled={!playerA && !playerB}
                aria-label="Simulate throws"
              >
                ▶ Simulate
              </button>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSimPaused((p) => !p)}
                aria-label={simPaused ? "Resume simulation" : "Pause simulation"}
              >
                {simPaused ? "▶ Resume" : "⏸ Pause"}
              </button>
            )}
            {simActive && (
              <label className="target-map-speed-label">
                <input
                  type="checkbox"
                  checked={simSpeed === 2}
                  onChange={(e) => setSimSpeed(e.target.checked ? 2 : 1)}
                  aria-label="2× speed"
                />
                2×
              </label>
            )}
            {simState && (
              <button className="btn btn-secondary btn-sm" onClick={cancelSim} aria-label="Reset to full profile">
                ✕ Reset
              </button>
            )}
            {throwCaption && (
              <span className="target-map-caption" aria-hidden="true">{throwCaption}</span>
            )}
          </div>

          {simActive && (
            <p className="target-map-sim-note">
              Throws are randomly sampled from each player's real target distribution — not a replay of actual plays.
            </p>
          )}

          {/* Player list */}
          <PlayerList
            players={players}
            playerA={playerA}
            playerB={playerB}
            onAssign={assignPlayerDirect}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        </div>

        {/* ── Right column ── */}
        <div className="target-map-right">
          <StatsPanel playerA={playerA} playerB={playerB} />
        </div>
      </div>
    </div>
  );
}
