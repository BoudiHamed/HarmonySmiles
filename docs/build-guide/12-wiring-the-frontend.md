# Part 12 — Wiring the Frontend

This part is shorter than the others on purpose — this guide's focus is the backend and database, where almost all of the real engineering decisions in this project live. The frontend is deliberately simple: plain HTML, CSS, and vanilla JavaScript, no framework, no bundler, no build step at all. But it's worth understanding *how* something this simple correctly talks to a real, authenticated API, because the patterns here — even without a framework — are the same ones you'd reach for in a much larger frontend.

## Why no framework, no build step

For a project this size — a handful of pages, two of which need to talk to an API at all — reaching for React, a bundler, and a build pipeline would add real tooling overhead (a `package.json`, a build step, a dev server, deployment complexity) for very little actual benefit. Plain HTML files with a `<script>` tag pointing at a small, focused `.js` file per page is simpler to reason about, simpler to deploy (Part 13 — it's just static files), and entirely sufficient for what this frontend actually needs to do. This is the same "don't reach for more tooling than the problem requires" theme from Part 01's monorepo decision, applied again at a different layer.

## The shared fetch wrapper: one place that knows how to talk to `/admin/*`

Every admin page needs to do the same three things on every API call: attach the login token, redirect to the login page if that token turns out to be invalid or expired, and surface the server's own error message if something goes wrong. Rather than repeating that logic in every page's script, it lives in one shared file:

```js
// frontend/page/admin/admin-api.js
const API_BASE_URL = 'https://your-backend.onrender.com/api';
const TOKEN_KEY = 'hs_admin_token';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function adminFetch(path, options = {}) {
  const token = getToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = './login.html';
    throw new Error('Session expired');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');

  return data;
}
```

This is directly connected to Part 09's `authMiddleware`: every admin request that reaches the backend without a valid token comes back `401`. `adminFetch` treats that status code specially — before anything else, it clears the (now-invalid) stored token and redirects straight to the login page. This means every single admin page, without any of them needing their own logic for it, correctly handles "your session expired while you were using the dashboard" by bouncing back to login — because the one function every one of them routes their API calls through already does it, once.

The token itself is stored in `localStorage` — a simple, synchronous, browser-native key-value store that survives page reloads and tab closures (unlike, say, an in-memory JavaScript variable, which would force a fresh login on every page navigation). This is a reasonable choice for an internal single-clinic admin tool; a public-facing product handling more sensitive data might weigh this differently (`localStorage` is readable by any JavaScript running on the page, which matters more if there's a realistic risk of a malicious script being injected — see Part 13's "known limitations" discussion of this project's currently wide-open CORS policy for a related, adjacent tradeoff).

## Using it: `login.js`

```js
// frontend/page/admin/login.js
if (getToken()) window.location.href = './dashboard.html'; // already logged in

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Login failed');

    setToken(data.token);
    window.location.href = './dashboard.html';
  } catch (error) {
    document.getElementById('loginError').textContent = error.message;
    document.getElementById('loginError').classList.remove('d-none');
  }
});
```

Notice this calls `fetch` directly, not `adminFetch` — deliberately: `adminFetch` attaches an `Authorization` header from a token that doesn't exist yet, since login is the one request whose entire job is to *obtain* that token in the first place. Everything after a successful login uses `adminFetch`.

## `admin-common.js`: the session guard, shared by every logged-in page

```js
// frontend/page/admin/admin-common.js — loaded on every admin page except login.html
if (!getToken()) window.location.href = './login.html';

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = './login.html';
});
```

Two things worth calling out. The guard at the top — checking `getToken()` and redirecting if it's missing, before the page does anything else — is the frontend's first line of defense against someone bookmarking or directly navigating to `dashboard.html` without ever having logged in. It's worth being honest about what this is and isn't: this check happens in the browser and can be bypassed by anyone who opens their browser's developer tools — it's a *convenience* redirect for the normal case, not a real security boundary. **The real security boundary is `authMiddleware` on the backend (Part 09)** — even if someone bypassed this frontend check entirely, every actual API call would still `401` without a valid token. This is worth internalizing as a general principle: **client-side checks are for user experience; server-side checks are for security.** Never rely on the frontend to be the thing actually protecting anything, because you can't control what code someone chooses to run in their own browser.

**`escapeHtml`**, by contrast, exists for a real security reason, not just UX. Look at how appointment or patient data gets rendered into the page (`dashboard.js`, `patients.js`, `patient-profile.js`):

```js
tbody.innerHTML = appointments.map((appointment) => `
  <tr>
    <td><a href="patient-profile.html?id=${appointment.patient_id}">${escapeHtml(appointment.first_name)} ${escapeHtml(appointment.last_name)}</a></td>
    ...
`).join('');
```

Every field that came from user-supplied data (a patient's name, phone, visit reason — anything a *patient* typed into the public booking form, which later gets displayed back to an *admin*) gets passed through `escapeHtml` before being inserted into the page's HTML. Without this, a patient could type something like `<script>...</script>` as their "first name" when booking, and if that string were inserted into the admin dashboard's HTML unescaped, that script would actually *execute* in the admin's browser the next time they viewed the dashboard — a real, classic Cross-Site Scripting (XSS) vulnerability, and a genuinely dangerous one here specifically, since it would mean a member of the public could run arbitrary JavaScript in a logged-in admin's browser session. `escapeHtml` works by leaning on the browser's own HTML-escaping behavior: setting `.textContent` on a throwaway `<div>` and reading back `.innerHTML` forces the browser to convert any HTML-meaningful characters (`<`, `>`, `&`, etc.) into their safe, literal text equivalents, so they display as plain text instead of being interpreted as markup.

**The one field this project's own history got wrong once, worth flagging as a lesson rather than hiding it:** this `escapeHtml`/session-guard/logout logic used to be copy-pasted independently into each admin page's own script, rather than living in this one shared file — and that duplication is exactly how a status badge on two of the three pages ended up rendering without being escaped, while the third page's independently-copied version happened to include it. Centralizing shared logic into one file isn't just about avoiding repetitive typing — it's specifically about not letting a fix applied in one copy fail to propagate to the others.

## The booking form: client-side validation as a courtesy, not a boundary

`bookappointment.js` mirrors most of the backend's own validation rules — minimum name length, the phone regex, weekday/date-range restrictions — and disables the submit button / shows inline errors before ever making a network request. This is worth understanding as pure user experience: a patient gets instant feedback without waiting on a round trip to the server, and the *specific* rules mirrored here (Part 06's `createAppointmentSchema`) are kept intentionally in sync with the backend's actual rules, so a client never has an input accepted here only to be confusingly rejected by the server a moment later.

But — and this is the same principle as the admin session guard above — **this client-side validation is not the enforcement boundary.** Nothing stops someone from bypassing this entirely and sending a raw, malformed request directly to `POST /api/appointments` with a tool like `curl`, skipping the browser and this JavaScript altogether. That request still has to pass through Part 06's real `createAppointmentSchema` on the server, which is the only place these rules are actually, unavoidably enforced. Never build only the client-side version of a validation rule and consider it done — everything here is a UX layer sitting *on top of* a backend that would reject the same bad input on its own regardless.

The phone number specifically is built from two separate inputs — a country-code `<select>` and a local-number `<input>` — concatenated together client-side into the single `phone` string format the backend's `CreateAppointmentDTO` (Part 04) actually expects. This is a small, genuinely nice UX touch (nobody wants to type a country code by hand) that has no bearing at all on the backend, which only ever sees one already-combined string, exactly matching what `createAppointmentSchema`'s regex validates.

## `API_BASE_URL`: one constant, deliberately duplicated, not shared

You'll notice `API_BASE_URL` is declared separately in `admin-api.js` and in `bookappointment.js` — two independent constants holding the same value, rather than one shared config file both import. For a project with no build step and no bundler, introducing a shared config module for exactly one string isn't worth the added indirection; it's simpler to just keep both in sync by hand when the backend's URL changes (which, as Part 13 covers, does need to happen — this exact value has to match wherever the backend actually ends up deployed).

## What you should have now

A frontend that talks correctly to every backend feature you've built across Parts 06–10 — booking, available slots, login, the full admin dashboard, patient management — running entirely as static files with no build step of its own.

**Next:** [Part 13 — Deploying to Render](13-deploying-to-render.md), taking everything you've built from your own machine to somewhere the rest of the world can actually reach it.
