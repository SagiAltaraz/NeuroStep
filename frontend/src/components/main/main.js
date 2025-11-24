import React from 'react';
import './main.css';

const Main = () => {
  return (
    <main className="main-section">
      <div className="main-wrapper">
        <section className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Bootstrap Ready</p>
            <h1>Center-stage content that adapts to every screen</h1>
            <p className="lead">
              The layout relies on percentages rather than fixed pixels so it scales
              smoothly from mobile devices up to large desktop displays.
            </p>
            <div className="cta-group">
              <button className="btn btn-primary">Start Building</button>
              <button className="btn btn-outline-secondary">See Docs</button>
            </div>
          </div>
          <div className="hero-card">
            <h2>Why percentages?</h2>
            <p>
              Percent-based sizing keeps spacing proportional, providing consistent
              breathing room without extra media queries.
            </p>
            <ul>
              <li>80% wrapper width keeps focus centered</li>
              <li>Fluid grid stretches responsibly</li>
              <li>Bootstrap utilities layer right on top</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Main;
