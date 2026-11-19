import { useEffect, useRef, useState } from "react";

export function LegalDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const openDialog = () => setIsOpen(true);
    window.addEventListener("fivezero2:legal:open", openDialog);
    return () => window.removeEventListener("fivezero2:legal:open", openDialog);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="legal-dialog"
      aria-labelledby="legal-dialog-title"
      onClose={() => setIsOpen(false)}
    >
      <header className="legal-dialog-header">
        <div>
          <span className="assistant-eyebrow">GOVERNANCE / REVIEW REQUIRED</span>
          <h2 id="legal-dialog-title">Terms &amp; privacy</h2>
        </div>
        <button
          type="button"
          className="assistant-close"
          aria-label="Close terms and privacy"
          onClick={() => setIsOpen(false)}
        >
          ×
        </button>
      </header>

      <p className="legal-draft-notice">
        Draft template for review. It is not legal advice or a substitute for terms approved by your
        organization&apos;s counsel.
      </p>

      <section className="legal-section" aria-labelledby="terms-heading">
        <h3 id="terms-heading">Terms of service &amp; acceptable use</h3>
        <p>
          Access is limited to invited workspace members and the permissions assigned to their account. You
          are responsible for the accuracy and lawful use of records entered or imported into your workspace.
        </p>
        <p>
          Use this workspace only for systems your organization owns or is explicitly authorized to assess. Do
          not use it to facilitate unauthorized access, credential abuse, malware, evasion, or activity
          against third-party systems.
        </p>
        <p>
          Threat records, system checks, and AI responses are operational aids, not guarantees of detection,
          remediation, or security. Verify findings and recommendations through your approved procedures
          before acting.
        </p>
      </section>

      <section className="legal-section" aria-labelledby="privacy-heading">
        <h3 id="privacy-heading">Privacy notice</h3>
        <p>
          The application processes account details, workspace records, and security audit events to provide
          the service. Workspace records are scoped to the authenticated workspace; administrators manage
          membership and access.
        </p>
        <p>
          DeepSeek requests are routed through Vercel AI Gateway. Workspace context is excluded by default. If
          you enable the context option, a limited summary of the current menu&apos;s records and workspace
          counts is sent with that request. Do not submit credentials, tokens, or secrets.
        </p>
        <p>
          AI provider processing and retention are governed by the applicable provider and Vercel terms. Your
          organization should review those terms and its own retention requirements before sharing sensitive
          data. Contact your workspace administrator for access, correction, or deletion requests.
        </p>
      </section>

      <footer className="legal-dialog-footer">
        <span>Review this draft with qualified counsel before relying on it as a binding agreement.</span>
        <button type="button" className="primary-button" onClick={() => setIsOpen(false)}>
          Close
        </button>
      </footer>
    </dialog>
  );
}
