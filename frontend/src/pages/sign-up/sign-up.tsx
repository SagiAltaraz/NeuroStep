import { SignupForm } from '../../components/signup-form/signup-form';
import './sign-up.css';

export default function SignupPage() {
  return (
    <div className="signup-page">
      <div className="signup-container">
        <SignupForm />
      </div>
    </div>
  );
}
