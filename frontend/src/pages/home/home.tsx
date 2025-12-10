import './home.css';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router-dom';
import logo from '../../../public/logo5.png';

const Home = () => {
  const navigate = useNavigate();

  const handlePlayClick = () => {
    navigate('/game');
  };

  return (
    <main className="main-section home-page">
      <div className="main-wrapper flex flex-col items-center justify-center h-screen gap-8">

        {/* Hero Section */}
        <section className="hero-grid text-center">
         <img src={logo} alt="NeuroStep Logo" className="hero-logo" />
          <p className="lead">Train your brain. Have fun.</p>

          <div className="cta-group">
            <Button variant="black" size="lg" onClick={handlePlayClick}>
              🎮 Let's Play
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Home;
