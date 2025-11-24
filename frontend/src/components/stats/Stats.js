import React from 'react';
import './stats.css';

const statItems = [
  { label: 'Templates', value: '120+' },
  { label: 'CSS Variables', value: '340' },
  { label: 'Avg. Build Time', value: '4 min' },
];

const Stats = () => {
  return (
    <section className="stats-section">
      <div className="stats-wrapper">
        <div className="stats-intro">
          <h2>Performance snapshot</h2>
          <p>
            These numbers are placeholders so you can wire in real analytics, downloads, or
            team metrics that prove the impact of your project.
          </p>
        </div>
        <div className="stats-grid">
          {statItems.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;

