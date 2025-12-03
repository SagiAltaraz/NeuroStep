// src/components/Header/Header.tsx
import React, { useState } from 'react';
import './Header.css';

const Header: React.FC = () => {
   const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

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
                     <a href="#chat">Chat</a>
                  </li>
                  <li>
                     <a href="#contact">Contact</a>
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
