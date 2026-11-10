import { useNavigate } from "react-router-dom";
import helmet from "../../assets/helmet.png";
import useScrollReveal from "../../hooks/useScrollReveal";
import "./HomePage.css";

const FEATURES = [
  {
    title: "roster explorer",
    body: "Browse every team in your Sleeper league. See starters, bench, and full rosters at a glance.",
  },
  {
    title: "trade analysis",
    body: "Backed by real NFL play-by-play data, not gut feelings. Know what you're giving up before you send the offer.",
  },
  {
    title: "instant search",
    body: "Find any player across all teams in seconds. No more digging through dropdown menus.",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  useScrollReveal();

  return (
    <div className="home-page">
      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="home-hero-field" aria-hidden="true">
          {[0, 1].map((loop) => (
            <div className="home-hero-field-group" key={loop}>
              {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((yard, i) => (
                <div key={i} className="home-hero-yardline">
                  <span className="home-hero-yard-number">{yard}</span>
                  <span className="home-hero-yard-number">{yard}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="home-hero-body">
          <div className="home-hero-top">
            <div className="home-hero-lockup">
              <img src={helmet} alt="" className="home-hero-helmet" aria-hidden="true" />
              <h1 className="home-title">
                <span>fan</span>
                <span>trade.</span>
              </h1>
            </div>
            <p className="home-subtitle">
              Smarter fantasy football trades, powered by real NFL data.
            </p>
          </div>
          <button className="btn btn-ghost btn-lg home-cta" onClick={() => navigate("/search")}>
            Get started
          </button>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="home-features">
        <div className="home-section-inner">
          <div className="home-features-grid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="home-feature-card reveal"
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                <h3 className="home-feature-title">{f.title}</h3>
                <p className="home-feature-body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section className="home-about">
        <div className="home-section-inner home-about-inner">
          <div className="home-about-label reveal">about the project</div>
          <p className="home-about-body reveal">
            fantrade brings together Sleeper league data and NFL
            play-by-play statistics to support trade analysis. Look up
            any Sleeper username to browse their leagues, explore every
            roster, and dig into the player-level numbers behind each
            trade offer.
          </p>
        </div>
      </section>
    </div>
  );
}
