import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { useSession } from '../app/SessionContext';
import { login, signup } from '../lib/api/auth';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup';
  const { token, signIn } = useSession();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (token) return <Navigate to="/app" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (isSignup && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = isSignup
        ? await signup(cleanEmail, password)
        : await login(cleanEmail, password);
      if (!response || typeof response.access_token !== 'string' || !response.access_token) {
        throw new Error('The server returned an incomplete sign-in response.');
      }
      signIn(response.access_token, typeof response.email === 'string' ? response.email : cleanEmail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-page__inner">
        <header className="auth-brand">
          <BrandMark />
          <span>ClipSearch</span>
        </header>

        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card__intro">
            <p className="eyebrow">Your video workspace</p>
            <h1 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            <p>{isSignup ? 'Start making your video library searchable.' : 'Sign in to continue to your library.'}</p>
          </div>

          {searchParams.get('expired') === '1' && (
            <div className="session-message" role="status">Your session expired. Sign in again to continue.</div>
          )}

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="form-field">
              <label className="field-label" htmlFor="auth-email">Email address</label>
              <input
                className="text-input"
                id="auth-email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(event) => { setEmail(event.currentTarget.value); setError(null); }}
                placeholder="you@example.com"
              />
            </div>
            <div className="form-field">
              <label className="field-label" htmlFor="auth-password">Password</label>
              <div className="password-input-wrap">
                <input
                  className="text-input"
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  minLength={isSignup ? 8 : undefined}
                  required
                  value={password}
                  onChange={(event) => { setPassword(event.currentTarget.value); setError(null); }}
                  placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button--primary auth-submit" type="submit" disabled={submitting || !email.trim() || !password}>
              {submitting ? <><span className="spinner spinner--light" aria-hidden="true" /> {isSignup ? 'Creating account…' : 'Signing in…'}</> : isSignup ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            {isSignup ? 'Already have an account?' : 'New to ClipSearch?'}{' '}
            <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </section>

        <p className="auth-footnote">Find anything. Inside every video.</p>
      </div>
    </main>
  );
}
