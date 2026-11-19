import { BrandMark } from "./brand-mark";

function AuthArrow() {
  return (
    <svg className="auth-action-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 10h11m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthScreen() {
  return (
    <section id="auth" className="auth-screen" aria-labelledby="auth-title">
      <div className="auth-brand">
        <BrandMark />
        <span>
          fivezero2<span className="brand-dot">.group</span>
        </span>
      </div>
      <div className="auth-card">
        <div className="auth-kicker">
          <span className="pulse-dot" /> WORKSPACE SIGN-IN
        </div>
        <h1 id="auth-title">Sign in to your workspace</h1>
        <p className="auth-copy">Use your organization account or a linked identity provider.</p>
        <div className="auth-tabs" id="auth-tabs" role="tablist" aria-label="Workspace access">
          <button type="button" className="auth-tab active" data-tab="login" role="tab" aria-selected="true">
            Sign in
          </button>
          <button type="button" className="auth-tab" data-tab="bootstrap" role="tab" aria-selected="false">
            First-time setup
          </button>
        </div>
        <div className="social-login" id="social-login">
          <button className="provider-button" type="button" data-provider="Google">
            <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M21.35 12.25c0-.78-.07-1.54-.2-2.25H12v4.26h5.24a4.48 4.48 0 0 1-1.95 2.94v2.4h3.15c1.84-1.7 2.91-4.2 2.91-7.35Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.64 0 4.86-.88 6.48-2.4l-3.15-2.4c-.87.59-1.98.94-3.33.94-2.56 0-4.72-1.73-5.5-4.05H3.25v2.48A9.99 9.99 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.5 14.09a6.02 6.02 0 0 1 0-4.18V7.43H3.25a10 10 0 0 0 0 9.14l3.25-2.48Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.86c1.44 0 2.73.5 3.75 1.5l2.82-2.82A9.43 9.43 0 0 0 12 2a9.99 9.99 0 0 0-8.75 5.43L6.5 9.91c.78-2.32 2.94-4.05 5.5-4.05Z"
              />
            </svg>
            Continue with Google
          </button>
          <button className="provider-button" type="button" data-provider="GitHub">
            <svg className="github-mark" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.68-3.76-1.31-3.76-1.31-.5-1.29-1.24-1.63-1.24-1.63-1.02-.7.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.76 2.02 3.37 1.54.1-.73.4-1.22.72-1.5-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.12-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.12 2.96.72.78 1.15 1.78 1.15 3 0 4.27-2.6 5.21-5.08 5.49.4.35.76 1.02.76 2.06v3.06c0 .3.2.64.77.53A11.1 11.1 0 0 0 12 .9Z"
              />
            </svg>
            Continue with GitHub
          </button>
          <p className="provider-note" id="provider-note">
            Use Google or GitHub if your workspace account is linked.
          </p>
        </div>
        <div className="auth-divider" id="auth-divider">
          <span>or sign in with your account</span>
        </div>
        <form id="login-form" className="auth-form">
          <label htmlFor="login-username">Username</label>
          <input id="login-username" name="username" autoComplete="username" required />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button className="primary-button auth-submit" type="submit">
            Sign in <AuthArrow />
          </button>
        </form>
        <form id="bootstrap-form" className="auth-form hidden">
          <label htmlFor="bootstrap-token">Bootstrap token</label>
          <input
            id="bootstrap-token"
            name="bootstrapToken"
            type="password"
            autoComplete="one-time-code"
            required
          />
          <small className="field-hint bootstrap-hint">
            Set BOOTSTRAP_TOKEN in the project environment before initializing the first owner account.
          </small>
          <label htmlFor="owner-username">Owner username</label>
          <input id="owner-username" name="username" minLength={3} required />
          <label htmlFor="owner-password">
            Password <span className="field-hint">12 characters minimum</span>
          </label>
          <input id="owner-password" name="password" type="password" minLength={12} required />
          <button className="primary-button auth-submit" type="submit">
            Initialize workspace <AuthArrow />
          </button>
        </form>
        <form id="oauth-invitation-form" className="auth-form hidden">
          <p className="field-hint">
            Your Google or GitHub identity is verified. Enter the one-time invitation token from your
            workspace administrator.
          </p>
          <label htmlFor="oauth-invitation-token">Invitation token</label>
          <input
            id="oauth-invitation-token"
            name="invitationToken"
            type="password"
            autoComplete="one-time-code"
            required
          />
          <button className="primary-button auth-submit" type="submit">
            Accept invitation <AuthArrow />
          </button>
        </form>
        <form id="oauth-bootstrap-form" className="auth-form hidden">
          <p className="field-hint">
            No workspace owner exists yet. Sign in with your verified Google or GitHub account, then enter the
            server bootstrap token.
          </p>
          <label htmlFor="oauth-bootstrap-token">Bootstrap token</label>
          <input
            id="oauth-bootstrap-token"
            name="bootstrapToken"
            type="password"
            autoComplete="one-time-code"
            required
          />
          <button className="primary-button auth-submit" type="submit">
            Initialize workspace <AuthArrow />
          </button>
        </form>
        <p id="auth-message" className="form-message" role="status" aria-live="polite" />
        <div className="auth-foot">
          <span>
            <svg className="lock-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            Session protected · Workspace isolated
          </span>
          <button
            type="button"
            className="legal-trigger"
            onClick={() => window.dispatchEvent(new Event("fivezero2:legal:open"))}
          >
            Terms &amp; Privacy
          </button>
        </div>
      </div>
    </section>
  );
}
