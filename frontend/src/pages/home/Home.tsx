import './Home.css';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import Logo from '../../components/Logo';

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
          <div className="hero-logo">
            <Logo height={46} />
          </div>

          <h1 className="hero-title">{t('home.title')}</h1>
          <p className="hero-subtitle">{t('home.subtitle')}</p>

          <div className="cta-section">
            <Button variant="black" size="lg" onClick={handlePlayClick}>
              {t('home.cta.start')}
            </Button>
            {user && (
              <button
                type="button"
                onClick={() => navigate('/journey')}
                className="cta-secondary"
              >
                {t('header.journey')}
              </button>
            )}
            {!user && (
              <p className="cta-hint">{t('home.cta.hint')}</p>
            )}
          </div>
        </section>

      </div>
    </main>
  );
};

export default Home;
