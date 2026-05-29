// ─── VETTOCHAT EMBED SCRIPT ──────────────────────────────────────────────────
// Paste this in the <head> of any website page:
// <script src="https://vettochat-backend.onrender.com/embed.js"
//         data-company-id="YOUR_COMPANY_ID"
//         id="vettochat-script"></script>

(function () {
  const scriptTag  = document.getElementById('vettochat-script');
  const companyId  = scriptTag ? scriptTag.getAttribute('data-company-id') : null;

  if (!companyId) {
    console.error('VettoChat: Missing data-company-id attribute on the script tag.');
    return;
  }

  // Container — fixed bottom-right, transparent to clicks in empty space
  const container = document.createElement('div');
  container.id = 'vettochat-container';
  container.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'width:400px',
    'height:700px',
    'max-width:90vw',
    'max-height:90vh',
    'z-index:999999',
    'pointer-events:none',
  ].join(';');

  // Iframe — pass companyId so widget knows which client config to load
  const iframe = document.createElement('iframe');
  iframe.src = `https://vettochat-backend.onrender.com/widget.html?companyId=${encodeURIComponent(companyId)}`;
  iframe.style.cssText = [
    'width:100%',
    'height:100%',
    'border:none',
    'pointer-events:all',
    'transition:all 0.3s ease',
  ].join(';');
  iframe.title = 'VettoChat';
  iframe.allow = 'clipboard-write';

  container.appendChild(iframe);
  document.body.appendChild(container);

  // Resize container based on open/close messages from the widget iframe
  window.addEventListener('message', function (event) {
    if (event.data === 'vettochat-open') {
      container.style.width  = '400px';
      container.style.height = '700px';
    } else if (event.data === 'vettochat-close') {
      container.style.width  = '100px';
      container.style.height = '100px';
    }
  });
})();
