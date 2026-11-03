// Present the server's guest limit consistently across downloads and editors.
export function showDownloadGate(code) {
  if (code !== 'SIGNUP_REQUIRED' || typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return false;
  let dialog = document.querySelector('[data-download-gate-dialog]');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'download-gate';
    dialog.dataset.downloadGateDialog = '';
    dialog.setAttribute('aria-labelledby', 'download-gate-title');
    dialog.setAttribute('aria-describedby', 'download-gate-description');
    dialog.innerHTML = `<div class="download-gate-card">
      <button class="download-gate-close" type="button" aria-label="Close"><span aria-hidden="true">×</span></button>
      <div class="download-gate-art" aria-hidden="true"><svg viewBox="0 0 96 82" fill="none"><ellipse cx="47" cy="74" rx="33" ry="4" fill="#583448" opacity=".13"/><rect x="20" y="15" width="43" height="53" rx="5" fill="#d6e6ea" transform="rotate(-9 20 15)"/><rect x="30" y="9" width="46" height="57" rx="5" fill="#fff" stroke="#d8e4e8" stroke-width="2"/><path d="M38 21h30M38 28h24M38 35h18" stroke="#b5c9cf" stroke-width="3" stroke-linecap="round"/><rect x="39" y="44" width="28" height="9" rx="4.5" fill="#f2e4e9"/><circle cx="73" cy="57" r="16" fill="#652a46"/><circle cx="73" cy="57" r="12.5" stroke="#e6bd99" stroke-width="1.2"/><path d="m67.5 57 4 4 7-8" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <p class="download-gate-eyebrow">YOUR FREE DOWNLOADS</p>
      <h2 id="download-gate-title">Ready for more?</h2>
      <p id="download-gate-description" class="download-gate-lead">You’ve used your <strong>5 free template selections.</strong> Create an account and verify your email to start your 30-day trial.</p>
      <div class="download-gate-benefits"><div><span aria-hidden="true">✓</span><p><strong>30 days to explore</strong><small>Your trial starts after email verification.</small></p></div><div><span aria-hidden="true">✓</span><p><strong>No card required</strong><small>Your trial ends without an automatic charge.</small></p></div><div><span aria-hidden="true">✓</span><p><strong>Your five selections stay yours</strong><small>You can still download those selections again.</small></p></div></div>
      <a class="download-gate-primary" data-gate-signup href="/signup/">Create My Free Account <span aria-hidden="true">→</span></a>
      <p class="download-gate-signin">Already have an account? <a data-gate-signin href="/signin/">Sign In</a></p>
    </div>`;
    dialog.querySelector('.download-gate-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  const returnTo = encodeURIComponent(location.pathname + location.search);
  dialog.querySelector('[data-gate-signup]').href = '/signup/?returnTo=' + returnTo;
  dialog.querySelector('[data-gate-signin]').href = '/signin/?returnTo=' + returnTo;
  if (!dialog.open) dialog.showModal();
  return true;
}
