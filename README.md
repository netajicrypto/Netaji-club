# नेताजी क्लब — Saraswati Puja Live Quiz Website

This ZIP contains the frontend, CSS, JavaScript, Firebase configuration placeholders, Firestore rules, and starter Cloud Functions.

## Important truth about this package
- The UI is styled to closely follow the approved six-screen mockup: cream/gold/saffron colors, maroon headings, floral motifs, player quiz, leaderboard, admin dashboard, winners, and reports.
- `public/assets/design-reference-collage.png` preserves the approved mockup image. `saraswati-hero.png` is cropped from that image as an artwork asset.
- Firebase is **not connected until you configure your own project**. Demo mode is only a visual/basic interaction preview; it stores demo state in `sessionStorage` and is not persistent backend storage.
- The Firebase starter backend includes server-side callable functions and rules, but it is **not yet a fully production-ready public anonymous player system**. The secure `joinQuiz` function requires Firebase Auth sign-in; a proper anonymous-auth flow and admin bootstrap must be configured before launch.
- Do not use demo mode for a real event or treat demo scores as official.

## Folder structure
- `public/index.html` — player-facing home and quiz
- `public/admin.html` — admin portal
- `public/css/styles.css` — shared responsive theme
- `public/js/app.js` — player UI logic
- `public/js/admin.js` — admin UI and question bank controls
- `public/js/firebase.js` — Firebase Web SDK configuration
- `functions/index.js` — server-side quiz create/join/start/submit/finalize functions
- `firestore.rules` — deny-by-default access rules
- `firebase.json` — Hosting/Functions/Firestore configuration
- `public/assets/` — mockup reference and artwork crop

## 1. Requirements
Install Node.js 20 LTS and Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
```

## 2. Create Firebase project
1. In Firebase Console, create a project.
2. Enable Firestore Database.
3. Enable Authentication. For this starter, enable Anonymous sign-in if you want to implement the anonymous-player flow, and use a stronger method for admins.
4. Register a Web App and copy its config.
5. Paste the web config values into `public/js/firebase.js`.
6. In Firebase Console, create an admin account and provision `admins/{AUTH_UID}` with `{ "active": true }` using a trusted Admin SDK environment. Never allow clients to write their own admin record.

## 3. Deploy
From this folder:
```bash
firebase use --add
npm --prefix functions install
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```
If the project asks for a billing plan for Cloud Functions, enable the required plan. Check current Firebase pricing before a live event.

## 4. Run locally
```bash
firebase emulators:start
```
For static-only preview, run a local HTTP server from `public`; don't open module-based pages via `file://`.

## 5. Data model
Firestore collections used by the starter functions:
- `admins`
- `quizzes`
- `questionBanks`
- `participants`
- `rounds`
- `questionAssignments`
- `answers`
- `scores`
- `winners`
- `quizEvents` (reserved for audit logging)

Important: `questionBanks` and `questionAssignments` include answer keys and are not readable by players under the supplied rules. Public question delivery should be implemented through a carefully designed callable function that returns only the active question/options, never `correctIndex`.

## 6. Before real-world use (mandatory)
1. Complete Firebase Auth flow for players and admins.
2. Add a callable `getCurrentQuestion` function that returns only question text/options and server-side deadline.
3. Build question-by-question round advancement and per-player assignment persistence.
4. Implement server-side answer deadline checks and an immutable, unique answer submission ID.
5. Persist round-wise scores, correct/wrong counts, response times, and tie-breakers.
6. Add transaction-safe leaderboard updates and finalization safeguards.
7. Add admin bootstrap, rate limiting / abuse controls, validation, and audit log.
8. Test two browser sessions and 20–30 concurrent players in Firebase Emulator/staging.
9. Verify that correct answers never appear in browser responses or public Firestore documents.
10. Review security rules and deploy to a separate staging project before the live puja event.

## JSON question format
```json
{
  "quizTitle": "Saraswati Puja Quiz",
  "questions": [
    {
      "question": "भारत का राष्ट्रीय पक्षी कौन है?",
      "options": ["तोता", "मोर", "कबूतर", "हंस"],
      "correctIndex": 1
    }
  ]
}
```
`correctIndex` is zero-based: 0=A, 1=B, 2=C, 3=D.

## Logo
The current circular "NC" emblem is a placeholder. Replace it with the official Netaji Club logo after the user supplies it. The generated reference collage is included unchanged.
