import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { isAdminPanelEnabled } from '../../config/features';
import Logo from '../Logo';
import './Header.css';

const Header: React.FC = () => {
   const [isMenuOpen, setIsMenuOpen] = useState(false);
   const { user, isAdmin, logout } = useAuth();
   const { t, toggle, lang } = useLang();

   return (
      <header className="header">
         <div className="header-container">
            {/* Logo */}
            <div className="logo">
               <Link to="/" style={{ textDecoration: "none" }}>
                  <Logo height={28} />
               </Link>
            </div>

            {/* Navigation */}
            <nav className={`nav ${isMenuOpen ? 'open' : ''}`}>
               <ul>
                  {user ? (
                     <>
                        <li className="welcome">
                           {t('header.welcome')}, <strong>{user.name}</strong>
                        </li>

                        <li>
                           <Link to="/journey">{t('header.journey')}</Link>
                        </li>

                        {isAdminPanelEnabled && isAdmin && (
                           <li>
                              <Link to="/admin" className="admin-link">
                                 {t('header.admin')}
                              </Link>
                           </li>
                        )}

                        <li>
                           <button className="logout-btn" onClick={logout}>
                              <LogOut size={14} />
                              <span>{t('header.logout')}</span>
                           </button>
                        </li>
                     </>
                  ) : (
                     <>
                        <li><Link to="/sign-up">{t('header.signup')}</Link></li>
                        <li><Link to="/log-in">{t('header.login')}</Link></li>
                     </>
                  )}

                  {/* Language toggle */}
                  <li>
                     <button
                        type="button"
                        className="lang-toggle"
                        onClick={toggle}
                        aria-label={lang === 'he' ? 'Switch to English' : 'החלף לעברית'}
                     >
                        <Globe size={14} />
                        <span>{t('header.lang.toggle')}</span>
                     </button>
                  </li>
               </ul>
            </nav>

            {/* Mobile Menu Toggle */}
            <button
               className="menu-toggle"
               onClick={() => setIsMenuOpen((prev) => !prev)}
            >
               {isMenuOpen ? '✕' : '☰'}
            </button>
         </div>
      </header>
   );
};

export default Header;
