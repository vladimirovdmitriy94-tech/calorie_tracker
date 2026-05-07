# Calorie Tracker — Progress

## Sessions completed
- Session 0 — Scaffolding: `index.html` created (login screen, chat screen, PWA manifest + SW, apiFetch helper, session management, chat history)

## UAT tests passing
- F-1.1-T: Login screen loads, Google button visible, no app content behind it
- F-1.2-T: Non-whitelisted email → "Access restricted — this app is private"
- F-1.4-T: Existing session in localStorage → skip login, show chat
- ERR-4-T: validateUser returns config_error → "App configuration error — please contact the owner"

## UAT tests still failing
- None from Session 0 scope

## What the next session needs to do
- Replace `YOUR_GOOGLE_CLIENT_ID` with the real OAuth 2.0 client ID (or confirm which session handles this)
- Implement `getStats` / `buildSystemPrompt` fully: fetch today's meals/targets from API and inject into prompt
- Add quick-action bar (Photo, Templates, Today's Stats buttons) and wire them to `apiFetch` calls

## Known issues / decisions
- Service worker registered via Blob URL — works in Chrome but scope is limited; SW intercepts only Apps Script fetches as a network fallback, not asset caching
- `GOOGLE_CLIENT_ID` is a placeholder; real Google sign-in requires an OAuth 2.0 client ID configured in Google Cloud Console with the app's origin whitelisted
- `window.__testLogin` and `window.__setSession` test hooks are intentionally left in; remove before production if desired
