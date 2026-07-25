# The Ledger — pledge & contribution tracker

A small web app for tracking contributor pledges/collections, with a
dashboard, a collection calendar (Sundays & Wednesdays highlighted, but
any day can be recorded), and role-based accounts (Admin, Treasurer,
Viewer). Built with plain HTML/CSS/JS, hosted on GitHub Pages, data
stored in Firebase (Auth + Firestore).

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and create a new project.
2. **Build → Authentication → Get started → Sign-in method** → enable
   **Email/Password**. (There is no public sign-up page — accounts are
   created by an admin from inside the app.)
3. **Build → Firestore Database → Create database** → start in
   **production mode** (the rules file below handles access control).
4. **Project settings (gear icon) → General → Your apps → </> (Web app)**
   → register an app (no need for Firebase Hosting) → copy the
   `firebaseConfig` object it gives you.

## 2. Configure the app

Open `js/firebase-config.js` and paste your config into `firebaseConfig`.
While you're there, you can also adjust:

- `currencySymbol` — defaults to `₱`
- `collectionDays` — which weekdays get highlighted on the calendar
  (`0=Sun … 6=Sat`, defaults to Sunday & Wednesday)

## 3. Deploy the security rules

The file `firestore.rules` in this project enforces the role rules
(admin/treasurer/viewer) **on the server side** — this is the real
security boundary, since anyone can view the JavaScript in a browser.

Easiest way to deploy them: open **Firestore Database → Rules** in the
Firebase console, paste in the contents of `firestore.rules`, and
click **Publish**. (Or use the Firebase CLI: `firebase deploy --only
firestore:rules` if you have a Firebase project scaffolded locally.)

## 4. Create your first admin account

There's no signup page on purpose — the first admin has to be created
by hand, once:

1. **Authentication → Users → Add user** — enter an email and password.
2. Copy the new user's **UID** shown in the users table.
3. **Firestore Database → Start collection** → collection ID `users` →
   document ID = the UID you just copied. Add these fields:
   - `name` (string) — e.g. `Admin`
   - `email` (string) — same email you used above
   - `role` (string) — `admin`
   - `active` (boolean) — `true`
4. Save. You can now sign in with that email/password at `index.html`,
   and use the **Users** tab in the app to create everyone else's
   accounts (treasurers and viewers) without touching the console again.

## 5. Publish to GitHub Pages

1. Push this folder to a GitHub repository.
2. **Settings → Pages** → Source: deploy from branch → pick your
   default branch and the root folder → Save.
3. GitHub gives you a URL like `https://yourname.github.io/repo-name/`.
   Open it — you should land on the sign-in page.

## Roles, at a glance

| Can do | Admin | Treasurer | Viewer |
|---|---|---|---|
| View dashboard, calendar, records | ✅ | ✅ | ✅ |
| Encode (add/edit/delete) contributions | ✅ | ✅ | ❌ |
| Add/edit/delete contributors | ✅ | ❌ | ❌ |
| Add/delete contribution types | ✅ | ❌ | ❌ |
| Create accounts, change roles, deactivate accounts | ✅ | ❌ | ❌ |

## Notes & limitations

- **Deactivating vs. deleting a user.** The client-side Firebase SDK
  can't delete another person's sign-in account (that needs a server
  with the Admin SDK). Instead, the Users tab lets an admin
  **deactivate** an account — this is enforced both in the UI and in
  the Firestore rules, so a deactivated person is signed out
  immediately and can't read or write any data, even though their
  login technically still exists.
- **Temporary passwords.** When an admin creates a new account, they
  set the initial password themselves and should share it with that
  person directly (there's no email invite flow). Encourage new users
  to be given the password securely.
- **Data model.** Four Firestore collections: `users`, `contributors`,
  `contributionTypes`, `contributions`. Each contribution stores a
  snapshot of the contributor's name and type's name at the time it
  was recorded, so historical records stay readable even if a
  contributor or type is later renamed or removed.
