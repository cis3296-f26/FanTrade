import Navbar from "../layout/Navbar";
import useScrollReveal from "../../hooks/useScrollReveal";
import "./AboutPage.css";

export default function AboutPage() {
  useScrollReveal();

  return (
    <div className="about-page">
      <Navbar />
      <main className="about-main">
        <h1 className="about-title reveal">About FanTrade</h1>

        <section className="about-section reveal">
          <p className="about-lead">
            FanTrade is a fantasy football project that brings together Sleeper
            league information and NFL play-by-play data to support trade
            analysis.
          </p>
        </section>

        <section className="about-section reveal">
          <h2>What it does</h2>
          <p>
            FanTrade connects your Sleeper leagues with real NFL play-by-play
            statistics so you can evaluate trades with actual data, not gut
            feelings. Look up any Sleeper username to browse their leagues,
            explore every roster, and dig into the player-level numbers behind
            each trade offer.
          </p>
        </section>

        <section className="about-section reveal">
          <h2>Tech stack</h2>
          <p>
            The backend is a Flask API that pulls from the Sleeper API and
            processes NFL play-by-play data via <code>nfl_data_py</code>. The
            frontend is built with Vite and React. Both are deployed together on
            Vercel, with all Flask routes served under the <code>/api</code>{" "}
            prefix.
          </p>
        </section>

        <section className="about-section reveal">
          <h2>How to use it</h2>
          <ol className="about-steps">
            <li>Go to League View and enter your Sleeper username.</li>
            <li>Select a league to browse all rosters.</li>
            <li>Search for any player across every team in your league.</li>
            <li>Use the Trade Calculator to evaluate offers with real data.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}
