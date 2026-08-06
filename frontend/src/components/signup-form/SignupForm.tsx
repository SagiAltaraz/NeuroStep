import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useLang, type Lang } from "../../context/LanguageContext";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../ui/button";
import Logo from "../Logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "../ui/field";
import { Input } from "../ui/input";
import PersonalFormModal from "../start-form/PersonalFormModal";
import * as authAPI from "../../api/auth";

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const { signup, loginWithGoogle } = useAuth();
  const { t, lang: currentLang } = useLang();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [language, setLanguage] = useState<Lang>(currentLang);
  const [isLoading, setIsLoading] = useState(false);
  const [showPersonalizationForm, setShowPersonalizationForm] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirm) {
      alert("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      alert("Password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);
    try {
      const res = await signup(name, email, password, language);

      if (res?.error) {
        alert(res.error);
      } else if (res?.token) {
        setToken(res.token);
        setShowPersonalizationForm(true);
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setIsLoading(true);
    try {
      const res = await loginWithGoogle();

      if (res?.error) {
        alert(res.error);
      } else if (res?.token) {
        setToken(res.token);
        setShowPersonalizationForm(true);
      }
    } catch (err) {
      console.error(err);
      alert("Google sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileGenerated = async (
    prompt: string,
    answers: Record<number, string>,
    answersRaw: Record<number, string[]>
  ) => {
    try {
      if (!token) {
        throw new Error("No token available");
      }

      const response = await authAPI.savePersonalizationProfile(
        token,
        answers,
        prompt,
        answersRaw
      );

      if (!response.success) {
        throw new Error(response.error || "Failed to save profile");
      }

      setShowPersonalizationForm(false);
      navigate("/");
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Error saving profile. Please try again.");
    }
  };

  if (showPersonalizationForm) {
    return (
      <PersonalFormModal
        isOpen={true}
        onClose={() => {
          setShowPersonalizationForm(false);
          navigate("/");
        }}
        onSubmit={handleProfileGenerated}
      />
    );
  }

  return (
    <Card className="mx-auto max-w-sm auth-form-card" {...props}>
      <CardHeader className="auth-card-header">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
          <Logo height={30} />
        </div>
        <CardTitle className="auth-card-title">{t('signup.title')}</CardTitle>
        <CardDescription className="auth-card-desc">{t('signup.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">{t('signup.name')}</FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t('signup.email')}</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
              <FieldDescription>{t('signup.email.hint')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t('signup.password')}</FieldLabel>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
              <FieldDescription>{t('signup.password.hint')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">{t('signup.confirm')}</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
                required
                disabled={isLoading}
              />
              <FieldDescription>{t('signup.confirm.hint')}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t('signup.lang.label')}</FieldLabel>
              <div role="radiogroup" className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 px-3 py-2 rounded-md border text-sm font-medium transition"
                  style={language === 'he'
                    ? { background: 'rgba(47,134,214,0.10)', borderColor: '#2f86d6', color: '#1c6bb0' }
                    : { background: '#fff', borderColor: '#e2e8f0', color: '#64748b' }}
                  onClick={() => setLanguage('he')}
                  disabled={isLoading}
                  aria-pressed={language === 'he'}
                >
                  עברית
                </button>
                <button
                  type="button"
                  className="flex-1 px-3 py-2 rounded-md border text-sm font-medium transition"
                  style={language === 'en'
                    ? { background: 'rgba(47,134,214,0.10)', borderColor: '#2f86d6', color: '#1c6bb0' }
                    : { background: '#fff', borderColor: '#e2e8f0', color: '#64748b' }}
                  onClick={() => setLanguage('en')}
                  disabled={isLoading}
                  aria-pressed={language === 'en'}
                >
                  English
                </button>
              </div>
              <FieldDescription>{t('signup.lang.hint')}</FieldDescription>
            </Field>

            <FieldGroup>
              <Field>
                <Button
                  type="submit"
                  className="w-full auth-submit-btn"
                  variant="brand"
                  disabled={isLoading}
                >
                  {isLoading ? t('signup.submit.loading') : t('signup.submit')}
                </Button>
              </Field>

              <FieldSeparator>{t('signup.or')}</FieldSeparator>

              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full"
                  onClick={handleGoogleSignup}
                  disabled={isLoading}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {t('signup.google')}
                </Button>
              </Field>

              <FieldDescription className="text-center">
                {t('signup.have.account')}{" "}
                <Link to="/log-in" className="underline">
                  {t('signup.signin.link')}
                </Link>
              </FieldDescription>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
