import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, LogOut, User, Map, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LanguageContext';
import { isAdminPanelEnabled } from '../../config/features';
import Logo from '../Logo';
import './Header.css';

const Header: React.FC = () => {
   const [isMenuOpen, setIsMenuOpen] = useState(false);
   const { user, isAdmin, logout } = useAuth();
   const { t, toggle, lang } = useLang();

   const close = () => setIsMenuOpen(false);

   return (
      <header className="header">
         <div className="header-container">
            {/* Logo */}
            <div className="logo">
               <Link to="/" style={{ textDecoration: 'none' }} onClick={close}>
                  <Logo height={28} />
               </Link>
            </div>

            {/* Navigation */}
            <nav className={`nav ${isMenuOpen ? 'open' : ''}`}>
               <ul>
                  {user ? (
                     <>
                        {/* Signed-in identity — a tidy chip, not loose text */}
                        <li className="user-chip" title={`${t('header.welcome')}, ${user.name}`}>
                           <User size={15} />
                           <span className="user-chip-greet">{t('header.welcome')},</span>
                           <span className="user-chip-name">{user.name}</span>
                        </li>

                        <li>
                           <Link to="/journey" className="nav-link" onClick={close}>
                              <Map size={15} />
                              <span>{t('header.journey')}</span>
                           </Link>
                        </li>

                        {isAdminPanelEnabled && isAdmin && (
                           <li>
                              <Link to="/admin" className="nav-link nav-link--admin" onClick={close}>
                                 <Shield size={15} />
                                 <span>{t('header.admin')}</span>
                              </Link>
                           </li>
                        )}

                        <li>
                           <button className="icon-btn logout-btn" onClick={() => { close(); logout(); }}>
                              <LogOut size={15} />
                              <span>{t('header.logout')}</span>
                           </button>
                        </li>
                     </>
                  ) : (
                     <>
                        <li>
                           <Link to="/log-in" className="nav-link" onClick={close}>
                              {t('header.login')}
                           </Link>
                        </li>
                        <li>
                           <Link to="/sign-up" className="nav-cta" onClick={close}>
                              {t('header.signup')}
                           </Link>
                        </li>
                     </>
                  )}

                  {/* Language toggle */}
                  <li>
                     <button
                        type="button"
                        className="icon-btn lang-toggle"
                        onClick={toggle}
                        aria-label={lang === 'he' ? 'Switch to English' : 'החלף לעברית'}
                     >
                        <Globe size={15} />
                        <span>{t('header.lang.toggle')}</span>
                     </button>
                  </li>
               </ul>
            </nav>

            {/* Mobile Menu Toggle */}
            <button
               className="menu-toggle"
               onClick={() => setIsMenuOpen((prev) => !prev)}
               aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            >
               {isMenuOpen ? '✕' : '☰'}
            </button>
         </div>
      </header>
   );
};

export default Header;
