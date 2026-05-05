import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

const Header: React.FC = () => {
   const [isMenuOpen, setIsMenuOpen] = useState(false);
   const { user, isAdmin, logout } = useAuth();

   return (
      <header className="header">
         <div className="header-container">
            {/* Logo */}
            <div className="logo">
               <h1>
                  <Link to="/">NeuroStep</Link>
               </h1>
            </div>

            {/* Navigation */}
            <nav className={`nav ${isMenuOpen ? 'open' : ''}`}>
               <ul>
                  {user ? (
                     <>
                        <li className="welcome">
                           Hello, <strong>{user.name}</strong>
                        </li>

                        {isAdmin && (
                           <li>
                              <Link to="/admin" className="admin-link">
                                 Admin Panel
                              </Link>
                           </li>
                        )}

                        <li>
                           <button className="logout-btn" onClick={logout}>
                              Logout
                           </button>
                        </li>
                     </>
                  ) : (
                     <>
                        <li>
                           <Link to="/sign-up">Sign Up</Link>
                        </li>
                        <li>
                           <Link to="/log-in">Log In</Link>
                        </li>
                     </>
                  )}
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
