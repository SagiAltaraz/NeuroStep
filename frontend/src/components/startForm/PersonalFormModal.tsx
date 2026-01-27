import React, { useState } from "react";
import "./PersonalFormModal.css";

interface Question {
  id: number;
  question: string;
  answers: string[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    question: "מה גילך?",
    answers: ["6-8", "9-12", "13-15", "16-18"]
  },
  {
    id: 2,
    question: "מה רמת הניסיון שלך בלימודים?",
    answers: ["חדש לגמרי", "מתחיל", "בינוני", "מתקדם"]
  },
  {
    id: 3,
    question: "איזה נושא הכי מעניין אותך?",
    answers: ["מתמטיקה", "מדעים", "טכנולוגיה", "ספרות", "היסטוריה"]
  },
  {
    id: 4,
    question: "כמה זמן אתה רוצה להקדיש ללימודים?",
    answers: ["5-10 דקות", "10-15 דקות", "15-30 דקות", "30+ דקות"]
  },
  {
    id: 5,
    question: "איזה סוג למידה עובד הכי טוב עבורך?",
    answers: ["משחקים", "חידות", "תחרויות", "סיפורים", "תרגול ישיר", "סרטונים"]
  },
  {
    id: 6,
    question: "מה ההצלחה שלך במשחקים דומים?",
    answers: ["מתחיל", "חצי דרך", "כמעט הסתיים", "השלמתי"]
  },
  {
    id: 7,
    question: "מה המוטיבציה שלך העיקרית?",
    answers: ["זה כיף", "רוצה ללמוד", "להשלים אתגר", "להפוך ליותר חכם", "להתחרות"]
  },
  {
    id: 8,
    question: "איך אתה מתמודד עם אתגרים קשים?",
    answers: ["מהר אני מוותר", "אני מנסה קצת", "אני מתעקש", "אני לא מוותר לעולם"]
  }
];

interface PersonalFormModalProps {
  onSubmit: (prompt: string, answers: Record<number, string>) => void;
  isOpen: boolean;
  onClose: () => void;
}

const PersonalFormModal: React.FC<PersonalFormModalProps> = ({
  onSubmit,
  isOpen,
  onClose
}) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isCompiling, setIsCompiling] = useState(false);

  if (!isOpen) return null;

  const handleAnswerClick = (answer: string) => {
    const newAnswers = {
      ...answers,
      [QUESTIONS[currentQuestion].id]: answer
    };
    setAnswers(newAnswers);

    // Move to next question or show summary
    if (currentQuestion < QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // All questions answered - compile prompt
      compilePrompt(newAnswers);
    }
  };

  const handleSkip = () => {
    if (currentQuestion < QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      compilePrompt(answers);
    }
  };

  const compilePrompt = (finalAnswers: Record<number, string>) => {
    setIsCompiling(true);
    
    // Build the prompt based on answers
    const promptParts: string[] = [
      "אתה עוזר AI שיוצר משחקים חינוכיים מותאמים אישית.",
      "",
      "אנא צור מצב משחק ראשוני בהתאם לפרופיל הלומד הבא:"
    ];

    QUESTIONS.forEach((q) => {
      const answer = finalAnswers[q.id];
      if (answer) {
        promptParts.push(`${q.question} ${answer}`);
      }
    });

    promptParts.push(
      "",
      "על סמך פרופיל זה, אנא צור:",
      "1. רמת קושי התחלתית מתאימה",
      "2. סוג משחק מומלץ",
      "3. אורך מפגש מוצע",
      "4. מוטיבטורים מותאמים אישית",
      "5. אסטרטגיית התקדמות מומלצת",
      "",
      "פרט בקצרה את המצב הראשוני ההמלצות שלך."
    );

    const finalPrompt = promptParts.join("\n");
    
    // Simulate compilation delay for UX
    setTimeout(() => {
      onSubmit(finalPrompt, finalAnswers);
    }, 800);
  };

  const question = QUESTIONS[currentQuestion];
  const isAnswered = answers[question.id] !== undefined;
  const progress = ((currentQuestion + (isAnswered ? 1 : 0)) / QUESTIONS.length) * 100;

  return (
    <div className="personal-form-overlay">
      <div className="personal-form-modal">
        {isCompiling ? (
          <div className="compiling-state">
            <div className="loader"></div>
            <h2>יוצר את הפרופיל שלך...</h2>
            <p>זה רק לקח שנייה</p>
          </div>
        ) : (
          <>
            <button className="close-button" onClick={onClose}>
              ✕
            </button>

            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>

            <div className="question-counter">
              שאלה {currentQuestion + 1} מתוך {QUESTIONS.length}
            </div>

            <div className="question-section">
              <h2 className="question-text">{question.question}</h2>

              <div className="answers-grid">
                {question.answers.map((answer) => (
                  <button
                    key={answer}
                    className={`answer-button ${
                      answers[question.id] === answer ? "selected" : ""
                    }`}
                    onClick={() => handleAnswerClick(answer)}
                  >
                    <span className="answer-checkbox">
                      {answers[question.id] === answer && "✓"}
                    </span>
                    <span className="answer-text">{answer}</span>
                  </button>
                ))}
              </div>

              <div className="button-group">
                {!isAnswered && (
                  <button className="skip-button" onClick={handleSkip}>
                    דלג
                  </button>
                )}
                {isAnswered && currentQuestion === QUESTIONS.length - 1 && (
                  <button
                    className="submit-button"
                    onClick={() => compilePrompt(answers)}
                  >
                    סיים ובנה את הפרופיל
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PersonalFormModal;
