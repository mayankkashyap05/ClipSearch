import { useState, type FormEvent } from 'react';
import { Check, LogOut, Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import { apiBaseStorageKey, getApiBase } from '../lib/api/client';

function normalizeBase(value: string): string {
  const clean = value.trim();
  if (!clean) return '';
  const parsed = new URL(clean);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Enter a valid HTTP or HTTPS server URL.');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

export function SettingsPage() {
  const { email, signOut } = useSession();
  const navigate = useNavigate();
  const [apiBase, setApiBase] = useState(getApiBase);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveApiBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setError(null);
    try {
      const normalized = normalizeBase(apiBase);
      window.localStorage.setItem(apiBaseStorageKey(), normalized);
      setApiBase(normalized);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid server URL.');
    }
  }

  function handleSignOut() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="page-stack settings-page">
      <header className="page-heading">
        <h1>Settings</h1>
        <p>Manage your connection and signed-in account.</p>
      </header>

      <section className="settings-section" aria-labelledby="connection-title">
        <div className="settings-section__intro">
          <span className="settings-section__icon"><Server size={17} aria-hidden="true" /></span>
          <div>
            <h2 id="connection-title">API connection</h2>
            <p>Choose the server that stores and processes your videos.</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={saveApiBase}>
          <label className="field-label" htmlFor="api-base">API server URL</label>
          <input
            className="text-input"
            id="api-base"
            type="url"
            inputMode="url"
            placeholder="Use the current site"
            value={apiBase}
            onChange={(event) => { setApiBase(event.currentTarget.value); setSaved(false); setError(null); }}
          />
          <p className="field-help">Leave blank to use the server hosting ClipSearch. Use a full URL if your API is hosted separately.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {saved && <p className="settings-saved" role="status"><Check size={15} aria-hidden="true" /> Connection setting saved.</p>}
          <button className="button button--secondary" type="submit">Save connection</button>
        </form>
      </section>

      <section className="settings-section settings-account" aria-labelledby="account-title">
        <div className="settings-section__intro">
          <div>
            <h2 id="account-title">Account</h2>
            <p>You are signed in as <strong>{email || 'your account'}</strong>.</p>
          </div>
        </div>
        <button className="button button--secondary" type="button" onClick={handleSignOut}><LogOut size={15} aria-hidden="true" /> Sign out</button>
      </section>
    </div>
  );
}
