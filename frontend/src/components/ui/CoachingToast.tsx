import './CoachingToast.css';

interface Props {
  message: string | null;
}

export default function CoachingToast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="coaching-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
