import './home.css';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handlePlayClick = () => {
    navigate('/games/colorTracking');
  };

  return (
    <main className="home-page">
      <div className="home-container">
        <section className="hero-section">
          <img src="/logo5.png" alt="NeuroStep Logo" className="hero-logo" />

          <div className="cta-section">
            <Button variant="black" size="lg" onClick={handlePlayClick}>
              Start Training
            </Button>
            {!user && (
              <p className="cta-hint">Sign up for personalized progress tracking</p>
            )}
          </div>

          <h1 className="hero-title">Keep Your Mind Sharp</h1>
          <p className="hero-subtitle">
            Cognitive training through engaging games designed for adults
          </p>

          <div className="hero-features">
            <div className="feature-item">
              <span className="feature-icon">🧠</span>
              <span>Memory</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">👁️</span>
              <span>Focus</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>Speed</span>
            </div>
          </div>
        </section>

        <section className="benefits-section">
          <h2 className="benefits-title">Why NeuroStep?</h2>
          <div className="benefits-grid">
            <div className="benefit-card">
              <div className="benefit-icon">📊</div>
              <h3>Track Progress</h3>
              <p>Monitor your cognitive improvement over time with detailed analytics</p>
            </div>
            <div className="benefit-card">
              <div className="benefit-icon">🎯</div>
              <h3>Personalized</h3>
              <p>Games adapt to your level and focus on areas you want to improve</p>
            </div>
            <div className="benefit-card">
              <div className="benefit-icon">🎮</div>
              <h3>Fun & Engaging</h3>
              <p>Enjoyable exercises that feel like games, not homework</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Home;
