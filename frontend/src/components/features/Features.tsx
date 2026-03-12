import './Features.css';

const featureList = [
  {
    icon: '🎯',
    title: 'Personalized Training',
    copy: 'Games adapt to your skill level and focus on the cognitive areas you want to improve.',
  },
  {
    icon: '📈',
    title: 'Track Your Progress',
    copy: 'Monitor your improvement over time with detailed analytics and insights.',
  },
  {
    icon: '🧩',
    title: 'Science-Based Games',
    copy: 'Each game is designed to target specific cognitive functions like memory, attention, and processing speed.',
  },
];

const Features = () => {
  return (
    <section className="features-section">
      <div className="features-wrapper">
        <div className="features-heading">
          <p className="eyebrow">How It Works</p>
          <h2>Train your brain in minutes a day</h2>
          <p className="description">
            Our cognitive training platform uses engaging games to help you maintain
            and improve your mental abilities.
          </p>
        </div>
        <div className="features-grid">
          {featureList.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <div className="feature-icon">{feature.icon}</div>
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
