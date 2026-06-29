import './CoachingToast.css';

interface Props {
  message: string | null;
}

export default function CoachingToast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="coaching-toast" role="status" aria-live="polite">
      <span className="coaching-toast-avatar" aria-hidden="true">
        <span className="coaching-toast-avatar-ring" />
        <span className="coaching-toast-avatar-face">
          <span className="coaching-toast-avatar-antenna" />
          <span className="coaching-toast-avatar-eye left" />
          <span className="coaching-toast-avatar-eye right" />
          <span className="coaching-toast-avatar-smile" />
        </span>
        <span className="coaching-toast-avatar-spark one" />
        <span className="coaching-toast-avatar-spark two" />
      </span>
      <span className="coaching-toast-message">{message}</span>
    </div>
  );
}
