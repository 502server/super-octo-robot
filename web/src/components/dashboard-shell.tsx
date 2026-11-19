import { BrandMark } from "./brand-mark";

export function DashboardShell() {
  return (
    <div id="dashboard" className="app-shell hidden">
      <button type="button" className="nav-scrim" id="nav-scrim" aria-label="Close navigation menu" hidden />
      <aside id="sidebar" className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#dashboard" aria-label="Fivezero2 home">
          <BrandMark />
          <span>
            fivezero2<span className="brand-dot">.group</span>
          </span>
        </a>
        <button
          type="button"
          className="mobile-menu-toggle"
          id="mobile-menu-toggle"
          aria-label="Open navigation menu"
          aria-controls="sidebar"
          aria-expanded="false"
        >
          <span className="menu-glyph" aria-hidden="true" />
        </button>
        <div className="workspace-switcher">
          <span className="workspace-avatar">F</span>
          <span className="workspace-label">
            <strong id="workspace-name">Fivezero2 SOC</strong>
            <small>Threat workspace</small>
          </span>
          <span className="chevron" aria-hidden="true">
            ⌄
          </span>
        </div>
        <label className="sidebar-search">
          <img src="/icons/Search.svg?tone=muted&v=2" alt="" aria-hidden="true" />
          <input id="sidebar-search" type="search" placeholder="Search menu…" aria-label="Search navigation menu" />
          <kbd aria-hidden="true">⌘ K</kbd>
        </label>
        <nav id="sidebar-nav" className="sidebar-nav" aria-label="Workspace sections" />
        <div className="sidebar-bottom">
          <div className="feed-status">
            <span className="status-orb" />
            <span>
              <strong>Workspace online</strong>
              <small id="feed-health">Feeds awaiting configuration</small>
            </span>
          </div>
          <button type="button" id="logout" className="profile-button">
            <span className="profile-avatar" id="profile-avatar">
              A
            </span>
            <span className="profile-copy">
              <strong id="profile-name">Analyst</strong>
              <small id="profile-role">Analyst</small>
            </span>
            <span className="chevron" aria-hidden="true">
              ⋯
            </span>
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-separator" aria-hidden="true">
              /
            </span>
            <strong id="breadcrumb-current">Dashboard</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <img
                className="header-svg-icon"
                src="/icons/Search.svg?tone=muted&v=2"
                alt=""
                aria-hidden="true"
              />
              <input
                id="global-search"
                type="search"
                placeholder="Search IOC, domain, alert…"
                aria-label="Search indicators and alerts"
              />
              <kbd aria-hidden="true">⌘ K</kbd>
            </label>
            <button
              type="button"
              className="icon-button"
              id="refresh"
              aria-label="Refresh workspace data"
              title="Refresh data"
            >
              <img
                className="header-svg-icon"
                src="/icons/RefreshCw.svg?tone=muted&v=2"
                alt=""
                aria-hidden="true"
              />
            </button>
            <button type="button" className="top-avatar" id="top-avatar" aria-label="Current user">
              A
            </button>
          </div>
        </header>
        <div id="view-root" className="view-root" tabIndex={-1} />
      </main>
    </div>
  );
}
