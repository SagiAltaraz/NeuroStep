// src/components/Header/Header.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

const Header: React.FC = () => {
   const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

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
                  <li>
                     <Link to="/">Home</Link>
                  </li>
                  <li>
                     <Link to="#features">Features</Link>
                  </li>
                  <li>
                     <Link to="/sign-up">Sign Up</Link>
                  </li>
                  <li>
                     <Link to="/log-in">Log In</Link>
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
