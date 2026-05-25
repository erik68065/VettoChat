// ─── THE DELIVERY NETWORK: VETTOCHAT EMBED SCRIPT ────────────────────────
// The contractor pastes this in their <head>:
// <script src="http://localhost:8080/embed.js" data-tenant-id="test-tenant-id" id="vettochat-script"></script>

(function() {
  // 1. Get the script tag and extract the unique Tenant ID
  const scriptTag = document.getElementById('vettochat-script');
  const tenantId = scriptTag ? scriptTag.getAttribute('data-tenant-id') : 'unknown';

  if (tenantId === 'unknown') {
    console.error('VettoChat: Missing data-tenant-id attribute.');
    return;
  }

  // 2. Create the wrapper container
  const container = document.createElement('div');
  container.id = 'vettochat-container';
  // Position it fixed to the bottom right of their website
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    height: 700px;
    max-width: 90vw;
    max-height: 90vh;
    z-index: 999999;
    pointer-events: none; /* Let clicks pass through empty space */
  `;

  // 3. Create the isolated iframe
  const iframe = document.createElement('iframe');
  // Pass the tenantId via URL parameters so the widget knows whose data to load
  iframe.src = `http://localhost:8080/widget.html?tenantId=${tenantId}`;
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    pointer-events: all; /* Catch clicks inside the iframe */
    transition: all 0.3s ease;
  `;

  container.appendChild(iframe);
  document.body.appendChild(container);

  // 4. Listen for messages from the iframe (e.g., to resize when closed)
  window.addEventListener('message', function(event) {
    // Security check - in production, verify event.origin
    if (event.data === 'vettochat-open') {
      container.style.height = '700px';
      container.style.width = '400px';
    } else if (event.data === 'vettochat-close') {
      // Shrink container to just the bubble size so it doesn't block the website
      container.style.height = '100px';
      container.style.width = '100px';
    }
  });
})();