import React from 'react';
import './features.css';

const featureList = [
  {
    title: 'Fluid Grid',
    copy: 'Every column uses percentages, so your layout flows naturally no matter the device width.',
  },
  {
    title: 'Utility Layers',
    copy: 'Stack Bootstrap utilities on top of these base styles for instant customization.',
  },
  {
    title: 'Composable Sections',
    copy: 'Break the page into focused sections, each with its own folder and stylesheet.',
  },
];

const Features = () => {
  return (
    <section className="features-section">
      <div className="features-wrapper">
        <div className="features-heading">
          <p className="eyebrow">Sections</p>
          <h2>Additional components that mirror the main module</h2>
          <p className="description">
            Use this area to describe any add-ons, services, or highlights you want to present beneath the hero.
          </p>
        </div>
        <div className="features-grid">
          {featureList.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;

