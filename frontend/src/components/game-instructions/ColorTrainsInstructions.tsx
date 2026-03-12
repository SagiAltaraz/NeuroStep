import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';

interface ColorTrainsInstructionsProps {
  onStart: () => void;
}

const ColorTrainsInstructions: React.FC<ColorTrainsInstructionsProps> = ({ onStart }) => {
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
          <CardTitle className="text-2xl">🚂 רכבות הצבעים</CardTitle>
          <CardDescription>אימון קוגניטיבי לשיפור יכולות המוח</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 text-right">
          <div>
            <h3 className="font-semibold text-lg mb-2">יתרונות קוגניטיביים</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li><strong>קשב וריכוז</strong> - שיפור היכולת להתמקד במשימה</li>
              <li><strong>מעקב חזותי</strong> - חיזוק היכולת לעקוב אחר אובייקטים בתנועה</li>
              <li><strong>זיכרון עבודה</strong> - אימון הזיכרון לטווח קצר</li>
              <li><strong>זיהוי דפוסים</strong> - שיפור היכולת לזהות צבעים וצורות במהירות</li>
              <li><strong>זמן תגובה</strong> - שיפור מהירות קבלת החלטות</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">הוראות המשחק</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
              <li>רכבת צבעונית תופיע על המסך</li>
              <li>שים לב לצבע הרכבת</li>
              <li>לחץ על התחנה בצבע המתאים לרכבת</li>
              <li>ככל שתהיה מהיר ומדויק יותר, תצבור יותר נקודות</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">טיפים להצלחה</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>התרכז בצבע הרכבת מיד כשהיא מופיעה</li>
              <li>דיוק חשוב יותר ממהירות - קח את הזמן שלך</li>
              <li>התאמן באופן קבוע לשיפור התוצאות</li>
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

export default ColorTrainsInstructions;
