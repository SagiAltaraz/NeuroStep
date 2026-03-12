import React, { useState } from "react";
import PersonalFormModal from "./PersonalFormModal";
import "./startform.css";

interface StartFormProps {
  onProfileGenerated?: (prompt: string, answers: Record<number, string>) => void;
}

const StartForm: React.FC<StartFormProps> = ({ onProfileGenerated }) => {
  const [showModal, setShowModal] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");

  const handleProfileGenerated = (prompt: string, answers: Record<number, string>) => {
    setGeneratedPrompt(prompt);
    setShowModal(false);
    
    // Call the callback if provided
    if (onProfileGenerated) {
      onProfileGenerated(prompt, answers);
    }
  };

  return (
    <div className="start-form-container">
      <button
        className="start-game-button"
        onClick={() => setShowModal(true)}
      >
        <span>התחל משחק אישי</span>
      </button>

      {generatedPrompt && (
        <div className="prompt-display">
          <h3>הפרופיל שלך נוצר בהצלחה!</h3>
          <pre>{generatedPrompt}</pre>
          <button
            className="copy-button"
            onClick={() => {
              navigator.clipboard.writeText(generatedPrompt);
              alert("הפרופיל הועתק ללוח!");
            }}
          >
            העתק ללוח
          </button>
        </div>
      )}

      <PersonalFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleProfileGenerated}
      />
    </div>
  );
};

export default StartForm;
