import React, { useEffect, useRef, useState } from 'react';
import {
   Accessibility,
   X,
   Type,
   Contrast,
   Droplet,
   Link as LinkIcon,
   BookOpen,
   PauseCircle,
   RotateCcw,
} from 'lucide-react';
import './AccessibilityWidget.css';

type FontSize = 'normal' | 'large' | 'larger' | 'largest';

interface AccessibilitySettings {
   fontSize: FontSize;
   highContrast: boolean;
   grayscale: boolean;
   highlightLinks: boolean;
   readableFont: boolean;
   pauseAnimations: boolean;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
   fontSize: 'normal',
   highContrast: false,
   grayscale: false,
   highlightLinks: false,
   readableFont: false,
   pauseAnimations: false,
};

const STORAGE_KEY = 'neurostep:a11y-settings';

const loadSettings = (): AccessibilitySettings => {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
   } catch {
      return DEFAULT_SETTINGS;
   }
};

const FONT_SIZE_ORDER: FontSize[] = ['normal', 'large', 'larger', 'largest'];

const AccessibilityWidget: React.FC = () => {
   const [isOpen, setIsOpen] = useState(false);
   const [settings, setSettings] = useState<AccessibilitySettings>(loadSettings);
   const panelRef = useRef<HTMLDivElement>(null);
   const buttonRef = useRef<HTMLButtonElement>(null);

   useEffect(() => {
      const root = document.documentElement;

      root.classList.remove(
         'a11y-font-large',
         'a11y-font-larger',
         'a11y-font-largest'
      );
      if (settings.fontSize !== 'normal') {
         root.classList.add(`a11y-font-${settings.fontSize}`);
      }

      root.classList.toggle('a11y-high-contrast', settings.highContrast);
      root.classList.toggle('a11y-grayscale', settings.grayscale);
      root.classList.toggle('a11y-highlight-links', settings.highlightLinks);
      root.classList.toggle('a11y-readable-font', settings.readableFont);
      root.classList.toggle('a11y-pause-animations', settings.pauseAnimations);

      try {
         localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
         // Storage quota or privacy mode — settings will be session-only.
      }
   }, [settings]);

   useEffect(() => {
      if (!isOpen) return;
      const handleClickOutside = (e: MouseEvent) => {
         if (
            panelRef.current &&
            !panelRef.current.contains(e.target as Node) &&
            buttonRef.current &&
            !buttonRef.current.contains(e.target as Node)
         ) {
            setIsOpen(false);
         }
      };
      const handleEscape = (e: KeyboardEvent) => {
         if (e.key === 'Escape') setIsOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
         document.removeEventListener('mousedown', handleClickOutside);
         document.removeEventListener('keydown', handleEscape);
      };
   }, [isOpen]);

   const update = <K extends keyof AccessibilitySettings>(
      key: K,
      value: AccessibilitySettings[K]
   ) => setSettings((prev) => ({ ...prev, [key]: value }));

   const cycleFontSize = () => {
      const idx = FONT_SIZE_ORDER.indexOf(settings.fontSize);
      const next = FONT_SIZE_ORDER[(idx + 1) % FONT_SIZE_ORDER.length];
      update('fontSize', next);
   };

   const reset = () => setSettings(DEFAULT_SETTINGS);

   const fontSizeLabel: Record<FontSize, string> = {
      normal: 'Normal',
      large: 'Large',
      larger: 'Larger',
      largest: 'Largest',
   };

   return (
      <>
         <button
            ref={buttonRef}
            type="button"
            className="a11y-fab"
            aria-label="Open accessibility menu"
            aria-expanded={isOpen}
            aria-controls="a11y-panel"
            onClick={() => setIsOpen((p) => !p)}
         >
            <Accessibility size={26} aria-hidden="true" />
         </button>

         {isOpen && (
            <div
               ref={panelRef}
               id="a11y-panel"
               className="a11y-panel"
               role="dialog"
               aria-label="Accessibility settings"
            >
               <div className="a11y-panel-header">
                  <h2>Accessibility</h2>
                  <button
                     type="button"
                     className="a11y-close-btn"
                     aria-label="Close accessibility menu"
                     onClick={() => setIsOpen(false)}
                  >
                     <X size={18} aria-hidden="true" />
                  </button>
               </div>

               <div className="a11y-options">
                  <button
                     type="button"
                     className="a11y-option"
                     onClick={cycleFontSize}
                     aria-label={`Text size: ${fontSizeLabel[settings.fontSize]}. Click to change.`}
                  >
                     <Type size={20} aria-hidden="true" />
                     <span className="a11y-option-label">Text size</span>
                     <span className="a11y-option-value">
                        {fontSizeLabel[settings.fontSize]}
                     </span>
                  </button>

                  <button
                     type="button"
                     className={`a11y-option ${settings.highContrast ? 'is-active' : ''}`}
                     onClick={() => update('highContrast', !settings.highContrast)}
                     aria-pressed={settings.highContrast}
                  >
                     <Contrast size={20} aria-hidden="true" />
                     <span className="a11y-option-label">High contrast</span>
                  </button>

                  <button
                     type="button"
                     className={`a11y-option ${settings.grayscale ? 'is-active' : ''}`}
                     onClick={() => update('grayscale', !settings.grayscale)}
                     aria-pressed={settings.grayscale}
                  >
                     <Droplet size={20} aria-hidden="true" />
                     <span className="a11y-option-label">Grayscale</span>
                  </button>

                  <button
                     type="button"
                     className={`a11y-option ${settings.highlightLinks ? 'is-active' : ''}`}
                     onClick={() => update('highlightLinks', !settings.highlightLinks)}
                     aria-pressed={settings.highlightLinks}
                  >
                     <LinkIcon size={20} aria-hidden="true" />
                     <span className="a11y-option-label">Highlight links</span>
                  </button>

                  <button
                     type="button"
                     className={`a11y-option ${settings.readableFont ? 'is-active' : ''}`}
                     onClick={() => update('readableFont', !settings.readableFont)}
                     aria-pressed={settings.readableFont}
                  >
                     <BookOpen size={20} aria-hidden="true" />
                     <span className="a11y-option-label">Readable font</span>
                  </button>

                  <button
                     type="button"
                     className={`a11y-option ${settings.pauseAnimations ? 'is-active' : ''}`}
                     onClick={() => update('pauseAnimations', !settings.pauseAnimations)}
                     aria-pressed={settings.pauseAnimations}
                  >
                     <PauseCircle size={20} aria-hidden="true" />
                     <span className="a11y-option-label">Pause animations</span>
                  </button>
               </div>

               <button type="button" className="a11y-reset-btn" onClick={reset}>
                  <RotateCcw size={16} aria-hidden="true" />
                  Reset all
               </button>
            </div>
         )}
      </>
   );
};

export default AccessibilityWidget;
