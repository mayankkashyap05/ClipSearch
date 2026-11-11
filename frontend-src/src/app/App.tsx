import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { SessionProvider, useSession } from './SessionContext';
import { VideoLibraryProvider } from './VideoLibraryContext';
import { AuthPage } from '../pages/AuthPage';
import { LibraryPage } from '../pages/LibraryPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SearchPage } from '../pages/SearchPage';
import { SettingsPage } from '../pages/SettingsPage';
import { VideoPage } from '../pages/VideoPage';

function ProtectedLayout() {
  const { token, sessionExpired } = useSession();
  if (!token) return <Navigate to={sessionExpired ? '/login?expired=1' : '/login'} replace />;
  return (
    <VideoLibraryProvider>
      <AppShell />
    </VideoLibraryProvider>
  );
}

function HomeRedirect() {
  const { token } = useSession();
  return <Navigate to={token ? '/app' : '/login'} replace />;
}

function RoutesView() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/app" element={<ProtectedLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="video/:videoId" element={<VideoPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <RoutesView />
      </BrowserRouter>
    </SessionProvider>
  );
}
