import './Home.css';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, dir } = useLang();

  const handlePlayClick = () => {
    navigate('/games');
  };

  return (
    <main className="home-page" dir={dir}>
      <div className="home-container">
        <section className="hero-section">
          <img
            src="/logo5.png"
            alt="NeuroStep Logo"
            className="hero-logo"
            width={1024}
            height={1024}
            fetchPriority="high"
          />

          <div className="cta-section">
            <Button variant="black" size="lg" onClick={handlePlayClick}>
              {t('home.cta.start')}
            </Button>
            {!user && (
              <p className="cta-hint">{t('home.cta.hint')}</p>
            )}
          </div>

          <h1 className="hero-title">{t('home.title')}</h1>
          <p className="hero-subtitle">{t('home.subtitle')}</p>

          <div className="hero-features">
            <div className="feature-item">
              <span className="feature-icon">🧠</span>
              <span>{t('home.feature.memory')}</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">👁️</span>
              <span>{t('home.feature.focus')}</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>{t('home.feature.speed')}</span>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
};

export default Home;
