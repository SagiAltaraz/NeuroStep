import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';

interface MemoryGameInstructionsProps {
  onStart: () => void;
}

const MemoryGameInstructions: React.FC<MemoryGameInstructionsProps> = ({ onStart }) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4" dir="rtl">
      <Card className="relative max-w-lg w-full">
        <button
          onClick={() => navigate('/games')}
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors duration-200"
        >
          <ChevronRight size={14} />
          חזור
        </button>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">🃏 משחק זיכרון</CardTitle>
          <CardDescription>אמן זיכרון חזותי וריכוז</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 text-right">
          <div>
            <h3 className="font-semibold text-lg mb-2">יתרונות קוגניטיביים</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li><strong>זיכרון חזותי</strong> - שינון מיקום של מידע על המסך</li>
              <li><strong>ריכוז וקשב</strong> - מעקב ממוקד אחר כל הקלפים</li>
              <li><strong>זיהוי דפוסים</strong> - מציאת התאמות בין פריטים</li>
              <li><strong>עיבוד מידע</strong> - שמירת מידע ועדכונו בזמן אמת</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">הוראות המשחק</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
              <li>לוח קלפים הפוכים מוצג על המסך</li>
              <li>לחץ על קלף כלשהו כדי לגלות אותו</li>
              <li>לחץ על קלף שני ‒ אם הם תואמים, הם נשארים גלויים</li>
              <li>אם אינם תואמים, שניהם יתהפכו חזרה</li>
              <li>מצא את כל הזוגות בכמה שפחות מהלכים</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">טיפים להצלחה</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>שנן את מיקום הקלפים שנחשפו גם אם לא הצלחת לצרף זוג</li>
              <li>התחל מפינות ‒ קל יותר לנווט את הלוח</li>
              <li>התאמן באופן קבוע לשיפור הזיכרון לטווח קצר</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="black" size="lg" onClick={onStart}>
            התחל משחק
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default MemoryGameInstructions;
