import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';

interface GameInstructionsProps {
  gameName: string;
  onStart: () => void;
}

const GameInstructions: React.FC<GameInstructionsProps> = ({ gameName, onStart }) => {
  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4" dir="rtl">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{gameName}</CardTitle>
          <CardDescription>אימון קוגניטיבי לשיפור יכולות המוח</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Cognitive Benefits Section */}
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

          {/* Game Instructions Section */}
          <div>
            <h3 className="font-semibold text-lg mb-2">הוראות המשחק</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
              <li>רכבת צבעונית תופיע על המסך</li>
              <li>שים לב לצבע הרכבת</li>
              <li>לחץ על התחנה בצבע המתאים לרכבת</li>
              <li>ככל שתהיה מהיר ומדויק יותר, תצבור יותר נקודות</li>
            </ol>
          </div>

          {/* Tips Section */}
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

export default GameInstructions;
