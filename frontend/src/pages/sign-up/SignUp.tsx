import { SignupForm } from '../../components/signup-form/SignupForm';
import './SignUp.css';

export default function SignupPage() {
  return (
    <div className="signup-page">
      <div className="signup-container">
        <SignupForm />
      </div>
    </div>
  );
}
