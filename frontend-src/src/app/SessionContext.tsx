import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSession,
  getStoredToken,
  saveSession,
  sessionExpiredEventName,
} from '../lib/api/client';

interface SessionContextValue {
  token: string | null;
  email: string;
  sessionExpired: boolean;
  signIn: (token: string, email: string) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [email, setEmail] = useState(() => window.localStorage.getItem('clipsearch_email') || '');
  const [sessionExpired, setSessionExpired] = useState(false);

  const signOut = useCallback(() => {
    clearSession();
    setToken(null);
    setEmail('');
    setSessionExpired(false);
  }, []);

  const expireSession = useCallback(() => {
    clearSession();
    setToken(null);
    setEmail('');
    setSessionExpired(true);
  }, []);

  const signIn = useCallback((nextToken: string, nextEmail: string) => {
    saveSession(nextToken, nextEmail);
    setToken(nextToken);
    setEmail(nextEmail);
    setSessionExpired(false);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'clipsearch_token') setToken(event.newValue);
      if (event.key === 'clipsearch_email') setEmail(event.newValue || '');
    };
    window.addEventListener(sessionExpiredEventName(), expireSession);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(sessionExpiredEventName(), expireSession);
      window.removeEventListener('storage', onStorage);
    };
  }, [expireSession]);

  const value = useMemo(() => ({ token, email, sessionExpired, signIn, signOut }), [token, email, sessionExpired, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
