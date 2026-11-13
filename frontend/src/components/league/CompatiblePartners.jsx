import { useState } from "react";

export default function CompatiblePartners({
  partners = [],
  yourAnalysis,
  targetPosition = "ANY",
  selectedPartnerId,
  loading = false,
  error = "",
  onSelectPartner,
  disabled = false,
}) {
  // Let the user collapse the entire section so it doesn't take up any vertical space
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Show top 3 matches by default so the list is compact and doesn't require excessive scrolling
  const [showAll, setShowAll] = useState(false);

  // Initial loading state when we have no partners yet
  if (loading && (!partners || partners.length === 0)) {
    return (
      <div className="compatible-partners-container" aria-live="polite">
        <div className="partners-header">
          <span className="partners-title">Recommended Trade Partners</span>
          <span className="partners-badge-count">Scanning...</span>
        </div>
        <div className="partner-scanning-box">
          <span className="scanning-pulse-dot" />
          <p className="muted">Scanning league rosters for positional dropoffs and depth surpluses…</p>
        </div>
      </div>
    );
  }

  if (error || !partners || partners.length === 0) {
    return null;
  }

  // When collapsed, just show a single compact clickable bar
  if (isCollapsed) {
    return (
      <div className="compatible-partners-container collapsed">
        <button
          type="button"
          className="partners-toggle-bar"
          onClick={() => setIsCollapsed(false)}
          aria-expanded={false}
          title="Expand recommended trade partners"
        >
          <div className="partners-toggle-title">
            <span className="partners-title">Recommended Trade Partners</span>
            <span className="partners-badge-count">
              {loading ? "Updating..." : `${partners.length} match${partners.length === 1 ? "" : "es"}`}
            </span>
          </div>
          <span className="partners-toggle-action">Show Matches ▾</span>
        </button>
      </div>
    );
  }

  const displayedPartners = showAll ? partners : partners.slice(0, 3);
  const remainingCount = partners.length - 3;

  return (
    <section className="compatible-partners-container" aria-label="Compatible Trade Partners">
      <div className="partners-header">
        <div className="partners-header-left">
          <span className="partners-title">Recommended Trade Partners</span>
          <span className="partners-badge-count">
            {loading ? "Updating..." : `${partners.length} match${partners.length === 1 ? "" : "es"}`}
          </span>
        </div>
        <button
          type="button"
          className="partners-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          aria-expanded={true}
          title="Minimize trade partners"
        >
          Hide ▴
        </button>
      </div>

      {/* Your Team Needs Summary */}
      {yourAnalysis && (
        <div className="your-needs-summary">
          <span className="summary-label">Outlook:</span>
          {targetPosition && targetPosition !== "ANY" && (
            <span className="summary-pill target">
              Target: {targetPosition}
            </span>
          )}
          {yourAnalysis.surplus_positions?.length > 0 && (
            <span className="summary-pill surplus">
              Surplus: {yourAnalysis.surplus_positions.join(", ")}
            </span>
          )}
          {yourAnalysis.need_positions?.length > 0 && (
            <span className="summary-pill need">
              Needs: {yourAnalysis.need_positions.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Partner Cards: Compact clickable cards to minimize scrolling */}
      <div className={`partner-cards-list ${loading ? "is-updating" : ""}`}>
        {displayedPartners.map((partner) => {
          const isSelected = String(partner.roster_id) === String(selectedPartnerId);
          const scoreClass =
            partner.compatibility_score >= 75
              ? "score-high"
              : partner.compatibility_score >= 55
              ? "score-good"
              : "score-mid";

          return (
            <div
              key={partner.roster_id}
              className={`partner-card ${isSelected ? "partner-card-selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => !disabled && onSelectPartner(partner)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !disabled) {
                  e.preventDefault();
                  onSelectPartner(partner);
                }
              }}
            >
              <div className="partner-card-row1">
                <div className="partner-team-info">
                  <span className="partner-name">{partner.team_name}</span>
                  <span className="partner-owner">{partner.owner_name}</span>
                </div>
                <div className="partner-card-badges">
                  {isSelected && <span className="partner-selected-pill">✓ Selected</span>}
                  <span className={`partner-score-badge ${scoreClass}`}>
                    {partner.compatibility_score}% Match
                  </span>
                </div>
              </div>

              {partner.primary_axis && (
                <div className="partner-axis-row">
                  <span className="axis-icon">⇄</span>
                  <span className="axis-text">{partner.primary_axis}</span>
                </div>
              )}

              <div className="partner-card-footer">
                <div className="partner-footer-tags">
                  {partner.partner_surplus_positions?.length > 0 && (
                    <span className="tag-chip tag-surplus">
                      They have: {partner.partner_surplus_positions.join(", ")}
                    </span>
                  )}
                  {partner.has_direct_trade && (
                    <span className="tag-chip tag-direct-ready" title="Immediate 2-for-2 trade package ready">
                      ⚡ 2-for-2 Ready
                    </span>
                  )}
                </div>
                <span className="partner-click-hint">
                  {isSelected ? "Active" : "Select →"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more toggle */}
      {remainingCount > 0 && (
        <button
          type="button"
          className="btn-toggle-partners"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show Fewer Matches ▴" : `Show ${remainingCount} More Partner${remainingCount === 1 ? "" : "s"} ▾`}
        </button>
      )}
    </section>
  );
}
