import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';

interface ShapesClickInstructionsProps {
  onStart: () => void;
}

const ShapesClickInstructions: React.FC<ShapesClickInstructionsProps> = ({ onStart }) => {
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
          <CardTitle className="text-2xl">🔵 צורות שקופצות</CardTitle>
          <CardDescription>אמן עיכוב תגובה וקשב סלקטיבי</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 text-right">
          <div>
            <h3 className="font-semibold text-lg mb-2">יתרונות קוגניטיביים</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li><strong>עיכוב תגובה</strong> - שליטה בדחף ללחוץ על צורות לא נכונות</li>
              <li><strong>קשב סלקטיבי</strong> - מיקוד על גירוי ספציפי בתוך רעש חזותי</li>
              <li><strong>זמן תגובה</strong> - הגבת מהר ככל האפשר על עיגולים</li>
              <li><strong>גמישות קוגניטיבית</strong> - הבחנה מהירה בין סוגי צורות</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">הוראות המשחק</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
              <li>צורות שונות יקפצו על המסך בצורה אקראית</li>
              <li>לחץ <strong>רק על עיגולים</strong> ‒ כמה שיותר מהר</li>
              <li>אל תלחץ על משולשים, ריבועים או צורות אחרות</li>
              <li>לחיצה שגויה תוריד נקודות</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-2">טיפים להצלחה</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>הסתכל על הצורה לפני שאתה לוחץ ‒ שניה אחת של בדיקה שווה!</li>
              <li>דיוק חשוב יותר ממהירות בשלבים מתקדמים</li>
              <li>התאמן להגדיל את מהירות הסינון החזותי</li>
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

export default ShapesClickInstructions;
