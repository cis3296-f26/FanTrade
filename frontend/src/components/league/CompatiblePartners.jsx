import { useState } from "react";

export default function CompatiblePartners({
  partners = [],
  yourAnalysis,
  selectedPartnerId,
  loading = false,
  error = "",
  onSelectPartner,
  disabled = false,
}) {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="compatible-partners-container" aria-live="polite">
        <div className="partners-header">
          <h4>Recommended Trade Partners</h4>
          <span className="partners-badge-count">Scanning...</span>
        </div>
        <div className="partner-scanning-box">
          <span className="scanning-pulse-dot" />
          <p className="muted">Scanning league rosters for positional dropoffs and depth surpluses…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!partners || partners.length === 0) {
    return null;
  }

  const displayedPartners = showAll ? partners : partners.slice(0, 3);
  const remainingCount = partners.length - 3;

  return (
    <section className="compatible-partners-container" aria-label="Compatible Trade Partners">
      <div className="partners-header">
        <h4>Recommended Trade Partners</h4>
        <span className="partners-badge-count">
          {partners.length} match{partners.length === 1 ? "" : "es"}
        </span>
      </div>

      <p className="partners-subtitle">
        Ranked by mutual roster need and positional depth compatibility.
      </p>

      {/* Your Team Needs Summary */}
      {yourAnalysis && (
        <div className="your-needs-summary">
          <span className="summary-label">Your Outlook:</span>
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

      {/* Partner Cards */}
      <div className="partner-cards-list">
        {displayedPartners.map((partner) => {
          const isSelected = String(partner.roster_id) === String(selectedPartnerId);
          const scoreClass =
            partner.compatibility_score >= 75
              ? "score-high"
              : partner.compatibility_score >= 55
              ? "score-good"
              : "score-mid";

          return (
            <article
              key={partner.roster_id}
              className={`partner-card ${isSelected ? "partner-card-selected" : ""}`}
            >
              <div className="partner-card-top">
                <div className="partner-team-info">
                  <strong className="partner-name">{partner.team_name}</strong>
                  <span className="partner-owner">{partner.owner_name}</span>
                </div>
                <span className={`partner-score-badge ${scoreClass}`}>
                  {partner.compatibility_score}% Match
                </span>
              </div>

              {partner.primary_axis && (
                <div className="partner-axis-row">
                  <span className="axis-icon">⇄</span>
                  <span className="axis-text">{partner.primary_axis}</span>
                </div>
              )}

              {/* Roster tags */}
              <div className="partner-roster-tags">
                {partner.partner_surplus_positions?.length > 0 && (
                  <span className="tag-chip tag-surplus">
                    They have: {partner.partner_surplus_positions.join(", ")}
                  </span>
                )}
                {partner.partner_need_positions?.length > 0 && (
                  <span className="tag-chip tag-need">
                    They need: {partner.partner_need_positions.join(", ")}
                  </span>
                )}
              </div>

              {/* Direct Trade Verified Badge */}
              {partner.has_direct_trade && partner.direct_trade_preview && (
                <div className="partner-direct-trade-banner">
                  <span className="direct-trade-check">✓</span>
                  <span>Direct 2-for-2 trade available</span>
                </div>
              )}

              <button
                type="button"
                className={`btn-select-partner ${isSelected ? "selected" : ""}`}
                disabled={disabled}
                onClick={() => onSelectPartner(partner)}
              >
                {isSelected ? "✓ Partner Selected" : "Select Partner →"}
              </button>
            </article>
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
