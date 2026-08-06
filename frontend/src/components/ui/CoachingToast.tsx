import { useEffect } from 'react';
import './CoachingToast.css';

export const COACHING_TOAST_EVENT = 'neurostep:coaching-toast';

interface Props {
  message: string | null;
}

export default function CoachingToast({ message }: Props) {
  useEffect(() => {
    if (!message) return;
    window.dispatchEvent(new CustomEvent(COACHING_TOAST_EVENT, {
      detail: { message },
    }));
  }, [message]);

  return null;
}
