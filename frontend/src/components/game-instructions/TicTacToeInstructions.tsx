import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';

interface TicTacToeInstructionsProps {
  onStart: () => void;
}

const TicTacToeInstructions: React.FC<TicTacToeInstructionsProps> = ({ onStart }) => {
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
          <CardTitle className="text-2xl">✖️ איקס עיגול</CardTitle>
          <CardDescription>אמן חשיבה אסטרטגית ותכנון קדימה</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 text-right">
          <div>
            <h3 className="font-semibold text-lg mb-2">יתרונות קוגניטיביים</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li><strong>חשיבה אסטרטגית</strong> - תכנון מספר צעדים קדימה</li>
              <li><strong>זיכרון עבודה</strong> - מעקב אחר מצב הלוח</li>
              <li><strong>גמישות קוגניטיבית</strong> - התאמה לצעדי היריב</li>
              <li><strong>קבלת החלטות</strong> - בחירת המהלך הטוב ביותר</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">הוראות המשחק</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
              <li>אתה משחק נגד המחשב על לוח 3×3</li>
              <li>לחץ על ריבוע ריק כדי לסמן X</li>
              <li>הראשון ליצור שלושה סימנים ברצף (שורה, עמודה, אלכסון) מנצח</li>
              <li>אם כל הריבועים מלאים ואין מנצח ‒ זה תיקו</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">טיפים להצלחה</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>תמיד חשוב גם על ההתקפה וגם על ההגנה</li>
              <li>הפינות הן המיקומים החזקים ביותר בלוח</li>
              <li>שים לב לשניים ברצף של המחשב ‒ חסום אותם!</li>
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

export default TicTacToeInstructions;
