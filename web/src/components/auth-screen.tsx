export function AuthScreen() {
  return (
    <section id="auth" className="auth-screen" aria-labelledby="auth-title">
      <div className="auth-brand">
        <span className="brand-mark">5</span>
        <span>
          fivezero2<span className="brand-dot">.group</span>
        </span>
      </div>
      <div className="auth-card">
        <div className="auth-kicker">
          <span className="pulse-dot" /> FIVEZERO2 SECURITY CONSOLE
        </div>
        <h1 id="auth-title">Sign in to your account</h1>
        <p className="auth-copy">Access your threat intelligence workspace.</p>
        <div className="auth-tabs" id="auth-tabs" role="tablist" aria-label="Workspace access">
          <button type="button" className="auth-tab active" data-tab="login" role="tab" aria-selected="true">
            Sign in
          </button>
          <button type="button" className="auth-tab" data-tab="bootstrap" role="tab" aria-selected="false">
            Enterprise Access
          </button>
        </div>
        <div className="social-login" id="social-login">
          <button className="provider-button" type="button" data-provider="Google">
            <span className="google-mark" aria-hidden="true">
              G
            </span>
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
            Google and GitHub sign-in require configured OAuth credentials.
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
            Sign in <span aria-hidden="true">→</span>
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
            Initialize workspace <span aria-hidden="true">→</span>
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
            Accept invitation <span aria-hidden="true">→</span>
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
            Initialize workspace <span aria-hidden="true">→</span>
          </button>
        </form>
        <p id="auth-message" className="form-message" role="status" aria-live="polite" />
        <div className="auth-foot">
          <span>
            <span className="lock-icon" aria-hidden="true">
              ▣
            </span>{" "}
            Session protected · Workspace isolated
          </span>
          <span className="powered-by">Powered by Red Hat &amp; Linux</span>
        </div>
      </div>
      <div className="auth-caption">THREAT INTELLIGENCE · EXPOSURE · RESPONSE</div>
    </section>
  );
}
