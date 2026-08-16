// Shared by every logged-in admin page (dashboard/patients/patient-profile, not login):
// the session guard, HTML-escaping helper, and logout handler were previously copy-pasted
// verbatim into each page's own script, which is how the status-badge escaping gap slipped
// through on two of the three pages. Load this after admin-api.js and before the page's own
// script, which is free to redeclare page-specific helpers (showError, formatDate, etc.).

if (!getToken()) {
  window.location.href = './login.html';
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = './login.html';
});
