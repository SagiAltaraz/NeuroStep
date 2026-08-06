import React, { useMemo, useState } from "react";
import "./PersonalFormModal.css";

type Locale = "he" | "en";

interface Option {
  id: string;
  labelHe: string;
  labelEn: string;
}

interface Question {
  id: number;
  titleHe: string;
  titleEn: string;
  subtitleHe: string;
  subtitleEn: string;
  minSelections: number;
  maxSelections: number;
  exclusiveOptionIds?: string[];
  options: Option[];
}

export interface QuestionnaireEntry {
  questionId: number;
  questionHe: string;
  questionEn: string;
  subtitleHe: string;
  subtitleEn: string;
  selectedOptionIds: string[];
  answersHe: string[];
  answersEn: string[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    titleHe: "מהי קבוצת הגיל שלך?",
    titleEn: "What is your age group?",
    subtitleHe: "",
    subtitleEn: "",
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: "under-50", labelHe: "מתחת ל-50", labelEn: "Under 50" },
      { id: "50-60", labelHe: "50-60", labelEn: "50-60" },
      { id: "61-70", labelHe: "61-70", labelEn: "61-70" },
      { id: "71-80", labelHe: "71-80", labelEn: "71-80" },
      { id: "over-80", labelHe: "מעל 80", labelEn: "Over 80" }
    ]
  },
  {
    id: 2,
    titleHe: "מהו המגדר שלך?",
    titleEn: "What is your gender?",
    subtitleHe: "",
    subtitleEn: "",
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: "male", labelHe: "זכר", labelEn: "Male" },
      { id: "female", labelHe: "נקבה", labelEn: "Female" },
      {
        id: "other-undisclosed",
        labelHe: "אחר / מעדיף שלא לציין",
        labelEn: "Other / Prefer not to say"
      }
    ]
  },
  {
    id: 3,
    titleHe: "אילו מהפעילויות הבאות אתה נוהג לבצע בשעות הפנאי?",
    titleEn: "Which of the following do you usually do in your free time?",
    subtitleHe: "",
    subtitleEn: "",
    minSelections: 1,
    maxSelections: 6,
    exclusiveOptionIds: ["none-of-the-above"],
    options: [
      {
        id: "reading",
        labelHe: "קריאת ספרים או עיתונים",
        labelEn: "Reading books or newspapers"
      },
      {
        id: "puzzles",
        labelHe: "פתרון תשבצים, סודוקו או משחקי חשיבה",
        labelEn: "Crosswords, sudoku or brain games"
      },
      {
        id: "exercise",
        labelHe: "פעילות גופנית (הליכה, שחייה וכו')",
        labelEn: "Physical activity (walking, swimming, etc.)"
      },
      {
        id: "art-music",
        labelHe: "יצירה, אמנות או נגינה",
        labelEn: "Art, crafts, or music"
      },
      { id: "tv", labelHe: "צפייה בטלוויזיה", labelEn: "Watching TV" },
      {
        id: "none-of-the-above",
        labelHe: "אף אחד מהנ\"ל",
        labelEn: "None of the above"
      }
    ]
  },
  {
    id: 4,
    titleHe: "באיזו תדירות אתה שוכח היכן הנחת חפצים יומיומיים?",
    titleEn: "How often do you forget where you placed daily items?",
    subtitleHe: "זיכרון",
    subtitleEn: "Memory",
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: "almost-never", labelHe: "כמעט ולעולם לא", labelEn: "Almost never" },
      { id: "sometimes", labelHe: "מדי פעם", labelEn: "Sometimes" },
      { id: "often", labelHe: "לעיתים קרובות", labelEn: "Often" },
      { id: "daily", labelHe: "כמעט כל יום", labelEn: "Almost every day" }
    ]
  },
  {
    id: 5,
    titleHe: "כשאתה פוגש אנשים חדשים, עד כמה קשה לזכור את השמות שלהם?",
    titleEn: "When meeting new people, how hard is it to remember their names?",
    subtitleHe: "זיכרון",
    subtitleEn: "Memory",
    minSelections: 1,
    maxSelections: 1,
    options: [
      {
        id: "very-easy-names",
        labelHe: "קל לי מאוד לזכור שמות",
        labelEn: "Very easy for me to remember names"
      },
      {
        id: "remember-most",
        labelHe: "אני זוכר את רובם, עם מעט מאמץ",
        labelEn: "I remember most names with little effort"
      },
      {
        id: "faces-not-names",
        labelHe: "קשה לי, אני לרוב זוכר את הפנים אך לא את השם",
        labelEn: "Hard for me; I remember faces but not names"
      },
      {
        id: "forget-immediately",
        labelHe: "קשה לי מאוד, אני שוכח כמעט מיד",
        labelEn: "Very hard; I forget almost immediately"
      }
    ]
  },
  {
    id: 6,
    titleHe: "האם אתה נעזר ברשימות כדי לזכור דברים שעליך לעשות?",
    titleEn: "Do you use lists/reminders to remember tasks?",
    subtitleHe: "זיכרון",
    subtitleEn: "Memory",
    minSelections: 1,
    maxSelections: 1,
    options: [
      {
        id: "no-lists",
        labelHe: "כמעט ולא, אני סומך על הזיכרון שלי",
        labelEn: "Almost never; I rely on my memory"
      },
      {
        id: "sometimes-lists",
        labelHe: "לפעמים, עבור משימות מורכבות",
        labelEn: "Sometimes, for complex tasks"
      },
      {
        id: "always-lists",
        labelHe: "תמיד, בלעדיהן אני שוכח דברים חשובים",
        labelEn: "Always; without them I forget important things"
      }
    ]
  },
  {
    id: 7,
    titleHe: "כשאתה קורא או צופה בטלוויזיה ויש רעש ברקע, כיצד זה משפיע עליך?",
    titleEn: "When reading/watching TV with background noise, how does it affect you?",
    subtitleHe: "קשב וריכוז",
    subtitleEn: "Attention",
    minSelections: 1,
    maxSelections: 1,
    options: [
      {
        id: "ignore-noise",
        labelHe: "אני מצליח להתרכז בקלות ומתעלם מהרעש",
        labelEn: "I focus easily and ignore the noise"
      },
      {
        id: "effort-focus",
        labelHe: "אני מצליח להתרכז, אך זה דורש ממני מאמץ",
        labelEn: "I can focus, but it takes effort"
      },
      {
        id: "noise-hard",
        labelHe: "הרעש מפריע לי מאוד וקשה לי להתרכז",
        labelEn: "The noise distracts me a lot"
      },
      {
        id: "lose-focus",
        labelHe: "אני מאבד ריכוז לחלוטין ונאלץ להפסיק",
        labelEn: "I lose focus completely and must stop"
      }
    ]
  },
  {
    id: 8,
    titleHe: "כמה זמן ברצף אתה מצליח לשמור על ריכוז במשימה אחת?",
    titleEn: "How long can you stay focused on one demanding task?",
    subtitleHe: "קשב וריכוז",
    subtitleEn: "Attention",
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: "over-hour", labelHe: "מעל שעה ברציפות", labelEn: "Over one hour" },
      { id: "30-60", labelHe: "בין חצי שעה לשעה", labelEn: "30 to 60 minutes" },
      { id: "15-30", labelHe: "כ-15 עד 30 דקות", labelEn: "About 15 to 30 minutes" },
      { id: "under-15", labelHe: "פחות מ-15 דקות", labelEn: "Less than 15 minutes" }
    ]
  },
  {
    id: 9,
    titleHe: "איך אתה מרגיש כשאתה נדרש לבצע שתי משימות במקביל?",
    titleEn: "How do you feel when doing two tasks at once?",
    subtitleHe: "תפקודים ניהוליים",
    subtitleEn: "Executive functions",
    minSelections: 1,
    maxSelections: 1,
    options: [
      {
        id: "multitask-easy",
        labelHe: "נוח לי מאוד, אני מבצע זאת בקלות",
        labelEn: "Very comfortable, I do it easily"
      },
      {
        id: "multitask-possible",
        labelHe: "אפשרי, אך דורש ממני יותר תשומת לב",
        labelEn: "Possible, but requires more attention"
      },
      {
        id: "multitask-stress",
        labelHe: "מלחיץ אותי וגורם לי לעשות טעויות",
        labelEn: "It stresses me and causes mistakes"
      },
      {
        id: "avoid-multitask",
        labelHe: "אני נמנע מכך לחלוטין ומעדיף דבר אחד בכל פעם",
        labelEn: "I avoid it and prefer one thing at a time"
      }
    ]
  },
  {
    id: 10,
    titleHe: "כאשר מוקצב זמן מוגבל לסיום משימה, כיצד זה משפיע עליך?",
    titleEn: "When under time pressure, how are you affected?",
    subtitleHe: "תפקודים ניהוליים",
    subtitleEn: "Executive functions",
    minSelections: 1,
    maxSelections: 1,
    options: [
      {
        id: "time-helps",
        labelHe: "עוזר לי להתרכז ולפעול מהר יותר",
        labelEn: "It helps me focus and act faster"
      },
      {
        id: "no-effect",
        labelHe: "לא משפיע עליי בצורה מיוחדת",
        labelEn: "No special effect"
      },
      {
        id: "time-stress",
        labelHe: "גורם לי ללחץ ולעיתים לפספוס פרטים",
        labelEn: "Causes stress and missed details"
      },
      {
        id: "freeze",
        labelHe: "מקשה עליי מאוד וגורם לי לקפוא או לטעות",
        labelEn: "Very hard; I freeze or make many mistakes"
      }
    ]
  },
  {
    id: 11,
    titleHe: "כשמתעוררת בעיה בלתי צפויה במהלך היום, כמה מהר אתה מוצא פתרון חלופי?",
    titleEn: "When an unexpected problem appears, how quickly do you find an alternative?",
    subtitleHe: "גמישות מחשבתית",
    subtitleEn: "Cognitive flexibility",
    minSelections: 1,
    maxSelections: 1,
    options: [
      {
        id: "adapt-fast",
        labelHe: "מיד, אני מסתגל בקלות למצבים חדשים",
        labelEn: "Immediately, I adapt easily"
      },
      {
        id: "few-moments",
        labelHe: "לוקח לי כמה רגעים לארגן את המחשבות ואז אני פועל",
        labelEn: "A few moments to organize thoughts, then I act"
      },
      {
        id: "need-time-help",
        labelHe: "לוקח לי זמן רב ואני זקוק לעזרה",
        labelEn: "It takes me long and I need help"
      },
      {
        id: "struggle-change",
        labelHe: "אני מתקשה מאוד להתמודד עם שינויים בתוכניות",
        labelEn: "I struggle a lot with changes in plans"
      }
    ]
  },
  {
    id: 12,
    titleHe: "אם חפץ נופל מהשולחן, מה הסיכוי שתתפוס אותו לפני שייפול?",
    titleEn: "If an object falls from a table, how likely are you to catch it?",
    subtitleHe: "מהירות תגובה",
    subtitleEn: "Reaction speed",
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: "very-high", labelHe: "סיכוי גבוה מאוד", labelEn: "Very high chance" },
      { id: "reasonable", labelHe: "סיכוי סביר", labelEn: "Reasonable chance" },
      {
        id: "low-slower",
        labelHe: "סיכוי נמוך, התגובות שלי איטיות יותר",
        labelEn: "Low chance, my reactions are slower"
      },
      {
        id: "no-chance",
        labelHe: "אין סיכוי, כנראה לא אספיק להגיב",
        labelEn: "No chance, I likely won't react in time"
      }
    ]
  },
  {
    id: 13,
    titleHe: "עד כמה אתה בטוח ביכולת שלך לנווט למקום חדש שאינך מכיר?",
    titleEn: "How confident are you navigating to an unfamiliar place?",
    subtitleHe: "התמצאות מרחבית",
    subtitleEn: "Spatial orientation",
    minSelections: 1,
    maxSelections: 1,
    options: [
      {
        id: "very-confident-nav",
        labelHe: "בטוח מאוד, אני מתמצא בקלות גם במקומות חדשים",
        labelEn: "Very confident, I orient easily"
      },
      {
        id: "usually-manage-nav",
        labelHe: "מסתדר בדרך כלל, במיוחד עם מפה או הוראות",
        labelEn: "Usually manage, especially with map/directions"
      },
      {
        id: "need-constant-gps",
        labelHe: "זקוק להכוונה תמידית (GPS או מאדם אחר)",
        labelEn: "Need constant guidance (GPS/person)"
      },
      {
        id: "lost-easily",
        labelHe: "אני נוטה ללכת לאיבוד בקלות",
        labelEn: "I get lost easily"
      }
    ]
  },
  {
    id: 14,
    titleHe: "אילו תחומים תרצה במיוחד לשפר באמצעות המשחקים באתר?",
    titleEn: "Which areas would you most like to improve with the games?",
    subtitleHe: "העדפות אישיות",
    subtitleEn: "Personal goals",
    minSelections: 1,
    maxSelections: 8,
    // NOTE: option IDs match ProblemId in data/cognitiveProblems.ts so the
    // saved personalization answer maps cleanly to cognitive domains.
    options: [
      {
        id: "working-memory",
        labelHe: "זיכרון עבודה (שמות, פרטים, רשימות)",
        labelEn: "Working memory (names, details, lists)"
      },
      {
        id: "selective-attention",
        labelHe: "קשב סלקטיבי (מיקוד וסינון הסחות דעת)",
        labelEn: "Selective attention (focus and filtering distractions)"
      },
      {
        id: "divided-attention",
        labelHe: "קשב מחולק (מעקב אחר כמה דברים במקביל)",
        labelEn: "Divided attention (multitasking)"
      },
      {
        id: "processing-speed",
        labelHe: "מהירות עיבוד (החלטות מהירות)",
        labelEn: "Processing speed (quick decisions)"
      },
      {
        id: "reaction-time",
        labelHe: "זמן תגובה (תגובה מהירה לגירוי)",
        labelEn: "Reaction time (fast response to stimuli)"
      },
      {
        id: "response-inhibition",
        labelHe: "עיכוב תגובה (שליטה בדחפים)",
        labelEn: "Response inhibition (impulse control)"
      },
      {
        id: "strategic-thinking",
        labelHe: "חשיבה אסטרטגית ותכנון",
        labelEn: "Strategic thinking and planning"
      },
      {
        id: "visual-spatial",
        labelHe: "חשיבה חזותית-מרחבית (מיקומים, ניווט)",
        labelEn: "Visual-spatial reasoning (locations, navigation)"
      }
    ]
  },
  {
    id: 15,
    titleHe: "אילו סוגי משחקים או פעילויות מחשב אתה מעדיף בדרך כלל?",
    titleEn: "Which types of games or computer activities do you usually prefer?",
    subtitleHe: "העדפות אישיות",
    subtitleEn: "Personal preferences",
    minSelections: 1,
    maxSelections: 5,
    exclusiveOptionIds: ["no-preference"],
    options: [
      {
        id: "numbers-logic",
        labelHe: "משחקי מספרים והיגיון (כמו סודוקו)",
        labelEn: "Number and logic games (e.g., sudoku)"
      },
      {
        id: "words-trivia",
        labelHe: "משחקי מילים וטריוויה (כמו תשבצים או שבץ-נא)",
        labelEn: "Word and trivia games (e.g., crosswords)"
      },
      {
        id: "visual-games",
        labelHe: "משחקים חזותיים (כמו פאזלים או מציאת הבדלים)",
        labelEn: "Visual games (e.g., puzzles, spot differences)"
      },
      {
        id: "dynamic-speed",
        labelHe: "משחקים דינמיים הדורשים מהירות ולחיצות מהירות",
        labelEn: "Dynamic speed-based games"
      },
      {
        id: "no-preference",
        labelHe: "אין לי העדפה מיוחדת / אני לא נוהג לשחק במשחקי מחשב",
        labelEn: "No special preference / I don't usually play games"
      }
    ]
  }
];

interface PersonalFormModalProps {
  onSubmit: (prompt: string, answers: Record<number, string>, questionnaire: QuestionnaireEntry[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

const getLabel = (locale: Locale, option: Option) =>
  locale === "he" ? option.labelHe : option.labelEn;

const PersonalFormModal: React.FC<PersonalFormModalProps> = ({
  onSubmit,
  isOpen
}) => {
  const [locale, setLocale] = useState<Locale>("he");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [isCompiling, setIsCompiling] = useState(false);

  const question = QUESTIONS[currentQuestion];
  const selectedOptionIds = answers[question.id] ?? [];
  const canProceed = selectedOptionIds.length >= question.minSelections;
  const progress = ((currentQuestion + (canProceed ? 1 : 0)) / QUESTIONS.length) * 100;

  const selectedCountMessage = useMemo(() => {
    if (locale === "he") {
      return `נבחרו ${selectedOptionIds.length} מתוך ${question.maxSelections}`;
    }
    return `${selectedOptionIds.length} of ${question.maxSelections} selected`;
  }, [locale, selectedOptionIds.length, question.maxSelections]);

  if (!isOpen) return null;

  const toggleAnswer = (optionId: string) => {
    const existing = answers[question.id] ?? [];
    const isSelected = existing.includes(optionId);
    const exclusiveIds = question.exclusiveOptionIds ?? [];
    const isExclusive = exclusiveIds.includes(optionId);

    let updatedSelection: string[];
    if (isSelected) {
      updatedSelection = existing.filter((id) => id !== optionId);
    } else if (question.maxSelections === 1) {
      updatedSelection = [optionId];
    } else if (isExclusive) {
      updatedSelection = [optionId];
    } else if (existing.some((id) => exclusiveIds.includes(id))) {
      updatedSelection = [optionId];
    } else if (existing.length >= question.maxSelections) {
      return;
    } else {
      updatedSelection = [...existing, optionId];
    }

    setAnswers((prev) => ({
      ...prev,
      [question.id]: updatedSelection
    }));
  };

  const buildAnswersRecord = (finalAnswers: Record<number, string[]>) => {
    const translated: Record<number, string> = {};

    QUESTIONS.forEach((q) => {
      const selected = finalAnswers[q.id] ?? [];
      const labels = selected
        .map((id) => q.options.find((option) => option.id === id))
        .filter((option): option is Option => Boolean(option))
        .map((option) => getLabel(locale, option));

      translated[q.id] = labels.join(", ");
    });

    return translated;
  };

  const buildQuestionnaireRecord = (finalAnswers: Record<number, string[]>): QuestionnaireEntry[] =>
    QUESTIONS.map((q) => {
      const selectedOptionIds = finalAnswers[q.id] ?? [];
      const selectedOptions = selectedOptionIds
        .map((id) => q.options.find((option) => option.id === id))
        .filter((option): option is Option => Boolean(option));

      return {
        questionId: q.id,
        questionHe: q.titleHe,
        questionEn: q.titleEn,
        subtitleHe: q.subtitleHe,
        subtitleEn: q.subtitleEn,
        selectedOptionIds,
        answersHe: selectedOptions.map((option) => option.labelHe),
        answersEn: selectedOptions.map((option) => option.labelEn),
      };
    });


  const compilePrompt = (finalAnswers: Record<number, string[]>) => {
    setIsCompiling(true);
    const translatedAnswers = buildAnswersRecord(finalAnswers);
    const questionnaire = buildQuestionnaireRecord(finalAnswers);

    const promptParts =
      locale === "he"
        ? [
            "אתה עוזר AI שבונה תוכנית אימון קוגניטיבית מותאמת אישית.",
            "",
            "הנה תשובות המשתמשת בשאלון הפתיחה:",
            ...QUESTIONS.map((q) => `- ${q.titleHe}: ${translatedAnswers[q.id]}`),
            "",
            "בהתאם לתשובות, צור:",
            "1. רמת פתיחה מומלצת",
            "2. סדר אימון לשבוע הראשון",
            "3. חלוקת זמן לכל אימון",
            "4. שני מנגנוני מוטיבציה מותאמים",
            "5. התאמות קושי לשבועיים הראשונים"
          ]
        : [
            "You are an AI coach creating a personalized cognitive training plan.",
            "",
            "Here are the user's onboarding answers:",
            ...QUESTIONS.map((q) => `- ${q.titleEn}: ${translatedAnswers[q.id]}`),
            "",
            "Based on these answers, provide:",
            "1. Recommended starting difficulty",
            "2. First-week training sequence",
            "3. Suggested session duration split",
            "4. Two personalized motivation triggers",
            "5. Difficulty adaptation for the first two weeks"
          ];

    const finalPrompt = promptParts.join("\n");

    setTimeout(() => {
      onSubmit(finalPrompt, translatedAnswers, questionnaire);
    }, 450);
  };

  const handleNext = () => {
    if (!canProceed) return;

    if (currentQuestion < QUESTIONS.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      return;
    }

    compilePrompt(answers);
  };

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    }
  };

  return (
    <div className="personal-form-overlay">
      <div className={`personal-form-modal ${locale === "he" ? "rtl" : "ltr"}`}>
        {isCompiling ? (
          <div className="compiling-state">
            <div className="loader" />
            <h2>{locale === "he" ? "בונה את הפרופיל שלך..." : "Building your profile..."}</h2>
            <p>{locale === "he" ? "כמעט סיימנו" : "Almost done"}</p>
          </div>
        ) : (
          <>
            <div className="language-switcher">
              <button
                type="button"
                className={`language-button ${locale === "he" ? "active" : ""}`}
                onClick={() => setLocale("he")}
              >
                עברית
              </button>
              <button
                type="button"
                className={`language-button ${locale === "en" ? "active" : ""}`}
                onClick={() => setLocale("en")}
              >
                English
              </button>
            </div>

            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <div className="question-counter">
              {locale === "he"
                ? `שאלה ${currentQuestion + 1} מתוך ${QUESTIONS.length}`
                : `Question ${currentQuestion + 1} of ${QUESTIONS.length}`}
            </div>

            <div className="question-section">
              <h2 className="question-text">
                {locale === "he" ? question.titleHe : question.titleEn}
              </h2>
              {(locale === "he" ? question.subtitleHe : question.subtitleEn) && (
                <p className="question-subtitle">
                  {locale === "he" ? question.subtitleHe : question.subtitleEn}
                </p>
              )}
              <p className="selection-meta">{selectedCountMessage}</p>

              <div className="answers-grid">
                {question.options.map((option) => {
                  const isSelected = selectedOptionIds.includes(option.id);
                  return (
                    <button
                      type="button"
                      key={option.id}
                      className={`answer-button ${isSelected ? "selected" : ""}`}
                      onClick={() => toggleAnswer(option.id)}
                    >
                      <span className="answer-checkbox">{isSelected ? "✓" : ""}</span>
                      <span className="answer-text">{getLabel(locale, option)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="button-group">
                <button
                  type="button"
                  className="nav-button secondary"
                  onClick={handleBack}
                  disabled={currentQuestion === 0}
                >
                  {locale === "he" ? "חזרה" : "Back"}
                </button>

                <button
                  type="button"
                  className="nav-button primary"
                  onClick={handleNext}
                  disabled={!canProceed}
                >
                  {currentQuestion === QUESTIONS.length - 1
                    ? locale === "he"
                      ? "סיום ובניית תוכנית"
                      : "Finish and build plan"
                    : locale === "he"
                    ? "המשך"
                    : "Continue"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PersonalFormModal;
