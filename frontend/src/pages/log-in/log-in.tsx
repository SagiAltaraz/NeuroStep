import { LoginForm } from '../../components/login-form/login-form';
import './log-in.css';

export default function Page() {
  return (
    <div className="login-page">
      <div className="login-container">
        <LoginForm />
      </div>
    </div>
  );
}
