import { LoginForm } from '../../components/login-form/LoginForm';
import './LogIn.css';

export default function Page() {
  return (
    <div className="login-page">
      <div className="login-container">
        <LoginForm />
      </div>
    </div>
  );
}
