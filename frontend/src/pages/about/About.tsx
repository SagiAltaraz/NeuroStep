import './About.css';
import { useLang } from '../../context/LanguageContext';

const creators = [
  {
    id: 1,
    nameKey: 'about.creator.1.name',
    roleKey: 'about.creator.1.role',
    imageSrc: '/images/sagi.jpg',
    imageAltKey: 'about.creator.1.name',
  },
  {
    id: 2,
    nameKey: 'about.creator.2.name',
    roleKey: 'about.creator.2.role',
    imageSrc: '/images/dor.jpg',
    imageAltKey: 'about.creator.2.name',
  },
  {
    id: 3,
    nameKey: 'about.creator.3.name',
    roleKey: 'about.creator.3.role',
    imageSrc: '/images/guy.jpg',
    imageAltKey: 'about.creator.3.name',
  },
  {
    id: 4,
    nameKey: 'about.creator.4.name',
    roleKey: 'about.creator.4.role',
    imageSrc: '/images/ian1.jpg',
    imageAltKey: 'about.creator.4.name',
  },
] as const;

const About = () => {
  const { t, dir } = useLang();

  return (
    <main className="about-page" dir={dir}>
      <section className="about-hero">
        <div className="about-hero-content">
          <p className="eyebrow">{t('header.about')}</p>
          <h1>{t('about.page.title')}</h1>
          <p className="subtitle">{t('about.page.subtitle')}</p>
        </div>
      </section>

      <section className="about-copy">
        <div className="section-card">
          <h2>{t('about.our-story.title')}</h2>
          <p>{t('about.our-story.text1')}</p>
          <p>{t('about.our-story.text2')}</p>
          <p>{t('about.our-story.text3')}</p>
        </div>
      </section>

      <section className="about-team">
        <div className="team-heading">
          <h2>{t('about.team.title')}</h2>
          <p>{t('about.team.subtitle')}</p>
        </div>

        <div className="team-grid">
          {creators.map((creator) => (
            <article key={creator.id} className="team-card">
              <div className="team-image">
                {creator.imageSrc ? (
                  <img
                    src={creator.imageSrc}
                    alt={t(creator.imageAltKey ?? 'about.image.placeholder')}
                  />
                ) : (
                  <span>{t('about.image.placeholder')}</span>
                )}
              </div>
              <div className="team-details">
                <p className="team-name">{t(creator.nameKey)}</p>
                <p className="team-role">{t(creator.roleKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};

export default About;
