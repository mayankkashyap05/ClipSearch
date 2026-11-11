import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Command,
  FileVideo2,
  FolderClosed,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  Upload,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from './SessionContext';
import { useVideoLibrary } from './VideoLibraryContext';
import { IngestDialog } from '../components/IngestDialog';
import { BrandMark } from '../components/BrandMark';
import { getInitials, videoDisplayName } from '../lib/format';
import type { VideoItem } from '../lib/api/types';

const primaryNavigation = [
  { label: 'Overview', to: '/app', icon: LayoutDashboard, end: true },
  { label: 'Library', to: '/app/library', icon: FolderClosed, end: false },
  { label: 'Search', to: '/app/search', icon: Search, end: false },
];

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/app/video/')) return 'Video workspace';
  if (pathname.startsWith('/app/library')) return 'Library';
  if (pathname.startsWith('/app/search')) return 'Search';
  if (pathname.startsWith('/app/settings')) return 'Settings';
  return 'Overview';
}

export function AppShell() {
  const { email, signOut } = useSession();
  const { videos, refresh, upsertVideo } = useVideoLibrary();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const mobileCloseButton = useRef<HTMLButtonElement>(null);
  const previouslyOpen = useRef(false);
  const [ingestMode, setIngestMode] = useState<'file' | 'url'>('file');
  const title = pageTitle(location.pathname);
  const platformShortcut = navigator.platform.toLowerCase().includes('mac') ? '⌘ K' : 'Ctrl K';

  useEffect(() => {
    if (mobileNavOpen) {
      previouslyOpen.current = true;
      mobileCloseButton.current?.focus();
    } else if (previouslyOpen.current) {
      previouslyOpen.current = false;
      mobileMenuButton.current?.focus();
    }
  }, [mobileNavOpen]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (ingestOpen) return;
        setMobileNavOpen(false);
        if (location.pathname === '/app/search') window.dispatchEvent(new Event('clipsearch:focus-search'));
        else navigate('/app/search');
      }
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [navigate, ingestOpen, location.pathname]);

  function openIngest(mode: 'file' | 'url' = 'file') {
    setIngestMode(mode);
    setIngestOpen(true);
  }

  function onVideoCreated(video: VideoItem) {
    upsertVideo(video);
    void refresh();
    setIngestOpen(false);
    navigate(`/app/video/${encodeURIComponent(video.video_id)}`);
  }

  function handleSignOut() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`app-shell${collapsed ? ' app-shell--collapsed' : ''}${mobileNavOpen ? ' app-shell--nav-open' : ''}`}>
      {mobileNavOpen && <button className="mobile-nav-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside id="primary-navigation" className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileNavOpen ? ' sidebar--mobile-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar__top">
          <Link to="/app" className="brand-lockup" aria-label="ClipSearch overview" onClick={() => setMobileNavOpen(false)}>
            <BrandMark />
            {!collapsed && <span className="brand-lockup__name">ClipSearch</span>}
          </Link>
          <button ref={mobileCloseButton} className="icon-button sidebar__mobile-close" type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Workspace">
          {primaryNavigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {!collapsed && (
          <div className="sidebar__recents">
            <div className="sidebar__section-heading"><span>Recent videos</span><Clock3 size={14} aria-hidden="true" /></div>
            {videos.length ? (
              <div className="sidebar__recent-list">
                {videos.slice(0, 5).map((video) => (
                  <Link
                    className="recent-link"
                    to={`/app/video/${encodeURIComponent(video.video_id)}`}
                    key={video.video_id}
                    title={video.filename || undefined}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <FileVideo2 size={15} aria-hidden="true" />
                    <span>{videoDisplayName(video)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="sidebar__recent-empty">Videos you add will appear here.</p>
            )}
          </div>
        )}

        <div className="sidebar__bottom">
          <NavLink
            to="/app/settings"
            title={collapsed ? 'Settings' : undefined}
            aria-label={collapsed ? 'Settings' : undefined}
            className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <Settings2 size={18} strokeWidth={1.8} aria-hidden="true" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
          <div className="sidebar-account">
            <span className="sidebar-account__avatar" aria-hidden="true">{getInitials(email)}</span>
            {!collapsed && <span className="sidebar-account__email" title={email}>{email || 'Account'}</span>}
            <button
              className="icon-button sidebar-account__signout"
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
          <button
            className="sidebar-collapse"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button ref={mobileMenuButton} className="icon-button topbar__menu" type="button" aria-label="Open navigation" aria-expanded={mobileNavOpen} aria-controls="primary-navigation" onClick={() => { setCollapsed(false); setMobileNavOpen(true); }}>
              <Menu size={19} aria-hidden="true" />
            </button>
            <span className="topbar__context">{title}</span>
          </div>
          <div className="topbar__actions">
            <button className="topbar-search" type="button" onClick={() => location.pathname === '/app/search' ? window.dispatchEvent(new Event('clipsearch:focus-search')) : navigate('/app/search')} aria-label={`Search videos (${platformShortcut})`}>
              <Search size={16} aria-hidden="true" />
              <span>Search videos</span>
              <kbd>{platformShortcut.includes('Ctrl') ? platformShortcut : <><Command size={11} aria-hidden="true" /> K</>}</kbd>
            </button>
            <button className="button button--primary button--small topbar__upload" type="button" onClick={() => openIngest('file')}>
              <Upload size={15} aria-hidden="true" /> <span>Add video</span>
            </button>
          </div>
        </header>

        <main className="page-content" id="main-content">
          <Outlet context={{ openIngest }} />
        </main>
      </div>

      <IngestDialog
        open={ingestOpen}
        initialMode={ingestMode}
        onClose={() => setIngestOpen(false)}
        onCreated={onVideoCreated}
      />
    </div>
  );
}
