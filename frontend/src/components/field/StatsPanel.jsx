import "./StatsPanel.css";

const LANE_NAMES = ["left", "middle", "right"];
const BAND_NAMES = ["0–5", "5–10", "10–15", "15–20", "20–30", "30+"];

function deepPct(shares) {
  // bands 4 and 5 = 20+ yards (indices lane*6+4 and lane*6+5)
  let total = 0;
  for (let lane = 0; lane < 3; lane++) {
    total += shares[lane * 6 + 4] + shares[lane * 6 + 5];
  }
  return total;
}

function computeOverlap(sharesA, sharesB) {
  let sum = 0;
  for (let i = 0; i < 18; i++) sum += Math.min(sharesA[i], sharesB[i]);
  return sum;
}

function computeBiggestDiff(sharesA, sharesB, nameA, nameB) {
  let maxDiff = -1;
  let maxIdx = 0;
  for (let i = 0; i < 18; i++) {
    const d = Math.abs(sharesA[i] - sharesB[i]);
    if (d > maxDiff) { maxDiff = d; maxIdx = i; }
  }
  const lane = Math.floor(maxIdx / 6);
  const band = maxIdx % 6;
  const valA = sharesA[maxIdx];
  const valB = sharesB[maxIdx];
  const [higher, lower, valH, valL] = valA >= valB
    ? [nameA, nameB, valA, valB]
    : [nameB, nameA, valB, valA];
  const depthStr = BAND_NAMES[band] === "30+" ? "30+ yds" : `${BAND_NAMES[band]} yds`;
  return `${higher} gets ${valH.toFixed(1)}% of his targets in the ${LANE_NAMES[lane]} zone at ${depthStr}, while ${lower} gets ${valL.toFixed(1)}%.`;
}

function PlayerCard({ player, color }) {
  const deep = deepPct(player.shares);
  return (
    <div className="stats-player-card">
      <div className="stats-player-header">
        <img
          className="stats-player-avatar"
          src={`https://a.espncdn.com/i/headshots/nfl/players/full/${player.espn_id}.png`}
          alt=""
          aria-hidden="true"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <div className="stats-player-title">
          <span className="stats-player-name" style={{ color }}>{player.name}</span>
          <span className="stats-player-team">{player.team}</span>
        </div>
      </div>
      <div className="stats-player-rows">
        <div className="stats-stat">
          <span className="stats-stat-value">{player.avg_depth}</span>
          <span className="stats-stat-label">avg. air yds</span>
        </div>
        <div className="stats-stat">
          <span className="stats-stat-value">{deep.toFixed(1)}%</span>
          <span className="stats-stat-label">deep % (20+)</span>
        </div>
        <div className="stats-stat">
          <span className="stats-stat-value">{player.targets}</span>
          <span className="stats-stat-label">targets</span>
        </div>
      </div>
    </div>
  );
}

export default function StatsPanel({ playerA, playerB }) {
  if (!playerA && !playerB) {
    return (
      <div className="stats-panel">
        <div className="stats-panel-empty">
          Pick two receivers to compare their target zones.
        </div>
        <DataNotes />
      </div>
    );
  }

  const overlap = playerA && playerB
    ? computeOverlap(playerA.shares, playerB.shares)
    : null;

  const diffText = playerA && playerB
    ? computeBiggestDiff(playerA.shares, playerB.shares, playerA.name, playerB.name)
    : null;

  return (
    <div className="stats-panel">
      {playerA && <PlayerCard player={playerA} color="#3d9f97" />}
      {playerB && <PlayerCard player={playerB} color="#f59e0b" />}

      {overlap !== null && (
        <div className="stats-compare-card">
          <h3>Comparison</h3>
          <div className="stats-overlap-number">{overlap.toFixed(1)}%</div>
          <div className="stats-overlap-bar-track">
            <div className="stats-overlap-bar-fill" style={{ width: `${overlap}%` }} />
          </div>
          <p className="stats-overlap-note">
            Share of targets that land in the same zones. 100% = identical usage patterns.
          </p>
          {diffText && (
            <>
              <p className="stats-diff-label">Biggest difference</p>
              <p className="stats-diff-text">{diffText}</p>
            </>
          )}
        </div>
      )}

      <DataNotes />
    </div>
  );
}

function DataNotes() {
  return (
    <div className="stats-notes">
      <p>Air yards measured from the line of scrimmage.</p>
      <p>Only 3 lanes exist in NFL play-by-play data (left / middle / right).</p>
      <p>Minimum 50 targets. Small samples are noisy.</p>
    </div>
  );
}
