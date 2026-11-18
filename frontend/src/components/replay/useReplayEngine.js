/**
 * useReplayEngine — deterministic play-by-play replay state machine.
 *
 * Drives playback independently of animation. The scene reads from the
 * engine's output every frame; the engine itself only advances when
 * the clock ticks or the user seeks.
 *
 * Exported state:
 *   playIndex        — current play index (0-based)
 *   playState        — "pre" | "animating" | "post" (phase within a play)
 *   playPhaseElapsed — seconds elapsed in current phase
 *   playing          — is playback running
 *   speed            — 1 | 2 | 4
 *   fantasyTotals    — { [playerId]: { name, pts, stats } }
 *   rosterContext    — from /api/replay/roster-context
 *
 * Controls:
 *   play / pause / togglePlay
 *   nextPlay / prevPlay
 *   seekTo(index)
 *   setSpeed(1|2|4)
 */
import { useReducer, useRef, useCallback, useEffect } from "react";

// How long each play phase lasts (seconds), before speed scaling
const PHASE_DURATIONS = {
  pre: 0.8,        // huddle / line-set phase before the snap
  animating: 3.0,  // actual play animation
  post: 0.6,       // result display before advancing
};

// Fantasy scoring defaults (overridden by league scoring_settings from API)
const DEFAULT_SCORING = {
  rec: 1.0,
  pass_td: 4,
  pass_yd: 0.04,
  rush_yd: 0.1,
  rush_td: 6,
  rec_yd: 0.1,
  rec_td: 6,
  fumble_lost: -2,
  int: -2,
  two_pt: 2,
};

export function calcFantasyPoints(playFantasy, scoring) {
  const s = { ...DEFAULT_SCORING, ...scoring };
  const result = {};
  for (const [pid, stats] of Object.entries(playFantasy || {})) {
    const pts =
      (stats.pass_yd || 0) * s.pass_yd +
      (stats.pass_td || 0) * s.pass_td +
      (stats.pass_int || 0) * s.int +
      (stats.rush_yd || 0) * s.rush_yd +
      (stats.rush_td || 0) * s.rush_td +
      (stats.rec || 0) * s.rec +
      (stats.rec_yd || 0) * s.rec_yd +
      (stats.rec_td || 0) * s.rec_td +
      (stats.fumble_lost || 0) * s.fumble_lost +
      (stats.two_pt || 0) * s.two_pt;
    result[pid] = { name: stats.name, pts: Math.round(pts * 100) / 100, stats };
  }
  return result;
}

function buildCumulativeFantasy(plays, scoring) {
  // Pre-compute cumulative fantasy totals at each play index
  const totals = []; // totals[i] = fantasy state AFTER play i resolves
  const running = {}; // { pid: { name, pts, stats{} } }

  for (let i = 0; i < plays.length; i++) {
    const play = plays[i];
    const playPts = calcFantasyPoints(play.fantasy, scoring);
    for (const [pid, val] of Object.entries(playPts)) {
      if (!running[pid]) {
        running[pid] = { name: val.name, pts: 0, stats: {} };
      }
      running[pid].pts = Math.round((running[pid].pts + val.pts) * 100) / 100;
      for (const [k, v] of Object.entries(val.stats)) {
        if (k !== "name") {
          running[pid].stats[k] = (running[pid].stats[k] || 0) + (v || 0);
        }
      }
    }
    totals.push(JSON.parse(JSON.stringify(running)));
  }
  return totals;
}

// Determine which plays a player was involved in
export function getPlayerPlays(plays, playerId) {
  return plays.reduce((acc, play, i) => {
    if (play.fantasy && play.fantasy[playerId]) acc.push(i);
    return acc;
  }, []);
}

// State shape
function makeInitialState(plays, scoring) {
  return {
    playIndex: 0,
    playState: "pre",
    playPhaseElapsed: 0,
    playing: false,
    speed: 1,
    fantasyByPlay: plays.length > 0 ? buildCumulativeFantasy(plays, scoring) : [],
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "TICK": {
      if (!state.playing) return state;
      const { dt, plays } = action;
      const scaledDt = dt * state.speed;
      const newElapsed = state.playPhaseElapsed + scaledDt;

      if (newElapsed < PHASE_DURATIONS[state.playState]) {
        return { ...state, playPhaseElapsed: newElapsed };
      }

      // Advance to next phase
      if (state.playState === "pre") {
        return { ...state, playState: "animating", playPhaseElapsed: 0 };
      }
      if (state.playState === "animating") {
        return { ...state, playState: "post", playPhaseElapsed: 0 };
      }
      // post → next play
      if (state.playIndex < plays.length - 1) {
        return { ...state, playIndex: state.playIndex + 1, playState: "pre", playPhaseElapsed: 0 };
      }
      // End of game
      return { ...state, playing: false, playState: "post" };
    }

    case "PLAY":
      return { ...state, playing: true };

    case "PAUSE":
      return { ...state, playing: false };

    case "TOGGLE":
      return { ...state, playing: !state.playing };

    case "SEEK":
      return {
        ...state,
        playIndex: Math.max(0, Math.min(action.index, action.maxIndex)),
        playState: "pre",
        playPhaseElapsed: 0,
        playing: false,
      };

    case "NEXT": {
      const next = Math.min(state.playIndex + 1, action.maxIndex);
      return { ...state, playIndex: next, playState: "pre", playPhaseElapsed: 0, playing: false };
    }

    case "PREV": {
      const prev = Math.max(state.playIndex - 1, 0);
      return { ...state, playIndex: prev, playState: "pre", playPhaseElapsed: 0, playing: false };
    }

    case "SET_SPEED":
      return { ...state, speed: action.speed };

    case "RESET":
      return makeInitialState(action.plays, action.scoring);

    default:
      return state;
  }
}

export default function useReplayEngine(plays, scoringSettings) {
  const scoring = { ...DEFAULT_SCORING, ...(scoringSettings || {}) };
  const [state, dispatch] = useReducer(reducer, plays, (p) => makeInitialState(p, scoring));
  const lastTsRef = useRef(null);
  const rafRef = useRef(null);
  const playsRef = useRef(plays);
  const playingRef = useRef(state.playing);

  useEffect(() => { playsRef.current = plays; }, [plays]);
  useEffect(() => { playingRef.current = state.playing; }, [state.playing]);

  // RAF-driven clock
  useEffect(() => {
    function tick(ts) {
      rafRef.current = requestAnimationFrame(tick);
      if (!playingRef.current) {
        lastTsRef.current = null;
        return;
      }
      if (lastTsRef.current === null) {
        lastTsRef.current = ts;
        return;
      }
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1);
      lastTsRef.current = ts;
      dispatch({ type: "TICK", dt, plays: playsRef.current });
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Reset when plays change (new game loaded)
  const prevPlaysRef = useRef(plays);
  useEffect(() => {
    if (plays !== prevPlaysRef.current && plays.length > 0) {
      prevPlaysRef.current = plays;
      dispatch({ type: "RESET", plays, scoring });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plays]);

  const maxIndex = Math.max(0, plays.length - 1);

  const controls = {
    play:        useCallback(() => dispatch({ type: "PLAY" }), []),
    pause:       useCallback(() => dispatch({ type: "PAUSE" }), []),
    togglePlay:  useCallback(() => dispatch({ type: "TOGGLE" }), []),
    nextPlay:    useCallback(() => dispatch({ type: "NEXT", maxIndex }), [maxIndex]),
    prevPlay:    useCallback(() => dispatch({ type: "PREV" }), []),
    seekTo:      useCallback((i) => dispatch({ type: "SEEK", index: i, maxIndex }), [maxIndex]),
    setSpeed:    useCallback((s) => dispatch({ type: "SET_SPEED", speed: s }), []),
  };

  const currentPlay = plays[state.playIndex] || null;
  const fantasyTotals = state.fantasyByPlay[state.playIndex] || {};

  // Normalize phase elapsed to 0-1 progress within current phase
  const phaseProgress = Math.min(
    state.playPhaseElapsed / (PHASE_DURATIONS[state.playState] || 1),
    1
  );

  return {
    ...state,
    currentPlay,
    maxIndex,
    fantasyTotals,
    phaseProgress,
    controls,
    PHASE_DURATIONS,
  };
}
