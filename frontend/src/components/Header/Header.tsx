// src/components/Header/Header.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Header.css';

const Header: React.FC = () => {
   const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
   const navigate = useNavigate();
   return (
      <header className="header">
         <div className="header-container">
            {/* Logo */}
            <div className="logo">
               <h1>NeuroStep</h1>
            </div>

            {/* Navigation */}
            <nav className={`nav ${isMenuOpen ? 'open' : ''}`}>
               <ul>
                  <li>
                     <a href="#main">Home</a>
                  </li>
                  <li>
                     <a href="#features">Features</a>
                  </li>
                  <li>
                     <button onClick={() => navigate('/sign-up')}>
                        Sign Up
                     </button>
                  </li>
                  <li>
                     <button onClick={() => navigate('/log-in')}>Log In</button>
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
