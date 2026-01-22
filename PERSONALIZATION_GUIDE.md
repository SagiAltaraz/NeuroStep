# מערכת הפרופיל האישי - NeuroStep

## סקירה כללית

כאשר משתמש מסיים את תהליך ה-Sign Up, הוא מעובר באופן אוטומטי לטופס אישי שמכיל 8 שאלות. התשובות שלו משמרות בדאטאבייס יחד עם prompt שנוצר בהתאם להתשובות. אחרי השלמת הטופס, המשתמש מנותב לעמוד הבית.

## תרשים זרימה

```
Sign Up מלא
    ↓
[PersonalFormModal] מופיע
    ↓
משתמש עונה על 8 שאלות
    ↓
Prompt נוצר בהתאם לתשובות
    ↓
נתונים נשלחים ל-Backend
    ↓
נתונים נשמרים בדאטאבייס
    ↓
עמוד הבית
```

## רכיבים

### Frontend Components

#### PersonalFormModal.tsx

- **ייעוד**: טופס ה-pop-up הראשי עם 8 שאלות
- **תכונות**:
   - שאלות עם 2-6 תשובות כל אחת
   - עברים חלקים בין שאלות
   - progress bar
   - יצירת prompt אוטומטית
   - animation ועיצוב פנימי

#### SignupForm.tsx (עודכן)

- **שינויים**:
   - לאחר signup מוצלח, מופיע PersonalFormModal
   - שמירה של ה-token לשימוש בשלב הבא
   - קריאה ל-API להצלת הפרופיל
   - הנתתן לעמוד הבית לאחר השלמה

#### StartForm.tsx

- **ייעוד**: קומפוננטה עבור משתמשים קיימים
- **תכונות**:
   - כפתור "התחל משחק אישי"
   - הצגת הפרופיל שנוצר
   - העתקה ללוח (clipboard)

### Backend Routes

#### personalizationRoutes.js

**נקודות קצה (Endpoints):**

1. `POST /api/personalization/profile/save`
   - **תיעוד**: שמירת פרופיל אישי חדש
   - **אימות**: Bearer Token (Protected)
   - **גוף בקשה**:

   ```json
   {
     "answers": {
       "1": "6-8",
       "2": "מתחיל",
       "3": "מתמטיקה",
       ...
     },
     "prompt": "אתה עוזר AI...\n..."
   }
   ```

   - **תגובה**: משתמש עם נתונים משוחזרים

2. `GET /api/personalization/profile`
   - **תיעוד**: קבלת פרופיל קיים
   - **אימות**: Bearer Token (Protected)
   - **תגובה**: פרופיל המשתמש עם ה-answers ו-prompt

### Schema MongoDB

```javascript
// User Model - backend/models/User.js
const UserSchema = new mongoose.Schema(
   {
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      role: { type: String, enum: ['user', 'admin'], default: 'user' },

      // Personalization Profile Fields
      personalizationAnswers: {
         type: mongoose.Schema.Types.Mixed, // Object with answers
         default: null,
      },
      personalizationPrompt: {
         type: String, // Generated AI prompt
         default: null,
      },
      profileCompletedAt: {
         type: Date, // When user completed the form
         default: null,
      },
   },
   { timestamps: true }
);
```

**Structure of personalizationAnswers:**

```javascript
{
  "1": "6-8",                    // גיל
  "2": "מתחיל",                 // ניסיון
  "3": "מתמטיקה",              // נושא
  "4": "5-10 דקות",             // זמן
  "5": "משחקים",               // סוג למידה
  "6": "מתחיל",                 // הצלחה קודמת
  "7": "זה כיף",               // מוטיבציה
  "8": "אני לא מוותר"          // תגובה לאתגר
}
```

## זרימת נתונים

### Sign Up Flow

1. משתמש מלא טופס Sign Up (שם, אימייל, סיסמה)
2. Backend יוצר משתמש חדש
3. Token חוזר לFrontend וה-signup-form שמר אותו
4. PersonalFormModal מופיע

### Personalization Form Flow

1. משתמש עונה על 8 שאלות (תשובה אחת בכל שאלה)
2. כל תשובה נשמרת ב-state
3. לאחר השלמת כל 8 השאלות, prompt נוצר
4. Prompt ו-Answers נשלחים ל-Backend דרך POST `/api/personalization/profile/save`
5. Backend שומר את הנתונים בשדות חדשים ב-User model
6. משתמש מנותב לעמוד הבית

## API Functions (frontend/src/api/auth.ts)

```typescript
// שמירת פרופיל אישי
savePersonalizationProfile(token, answers, prompt);

// קבלת פרופיל קיים
getPersonalizationProfile(token);
```

## שימוש בקוד

### מ-SignupForm

```tsx
const handleProfileGenerated = async (
   prompt: string,
   answers: Record<number, string>
) => {
   const response = await authAPI.savePersonalizationProfile(
      token,
      answers,
      prompt
   );
   navigate('/');
};
```

### קבלת פרופיל קיים

```tsx
const profile = await authAPI.getPersonalizationProfile(token);
console.log(profile.personalizationAnswers); // Parsed JSON
console.log(profile.personalizationPrompt); // Full prompt text
```

## התקנה ופריסה

### שלב 1: וודא ש-MongoDB מחובר

```bash
# בדוק ש-MONGO_URI מוגדר ב-.env
echo $MONGO_URI
```

### שלב 2: הפעל Backend

```bash
cd backend
npm run dev
# או
bun dev
```

### שלב 3: הפעל Frontend

```bash
cd frontend
npm run dev
# או
bun dev
```

## Migration ל-Firebase (בעתיד)

כאשר תעביר לFirebase, תשנה:

1. `personalizationRoutes.js` - להשתמש ב-Firestore במקום MongoDB
2. `User.js` - לשמור כ-Firestore collection
3. `authMiddleware.js` - לשימוש ב-Firebase Auth

הערה: הAPI endpoints יישארו זהים!

## שדות JSON ב-Answers (זהה למה ב-MongoDB)

התשובות נשמרות כ-Object ישירות ב-MongoDB, לא כ-JSON string:

## Notes

- כל תשובה נשמרת מיד לאחר בחירתה
- הטופס תומך בדילוג (Skip) בכל שאלה
- ה-prompt נוצר בעברית על בסיס התשובות
- המשתמש יכול להעתיק את ה-Prompt ללוח בהצגה שלו
