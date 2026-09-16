# GBM Attendance — Full-Stack Edition

Your original attendance app, now backed by a real Node.js + Express + SQLite
backend instead of browser storage. The look, layout, and every screen
(employee portal, GPS check, camera, admin dashboard, employees, leave/off,
reports, settings) work the same as before — they're just talking to a real
server and database now.

## What changed under the hood

- **Employees, attendance, leave/off and settings** are stored in a SQLite
  database file (`data/gbm-attendance.db`), not the browser.
- **GPS verification** is done twice: once in the browser for instant
  feedback, and again independently on the server (Haversine formula) right
  before an attendance record is saved. The server never trusts a "verified"
  flag from the browser.
- **Admin sign-in** uses a securely hashed passcode and a signed session
  cookie instead of a plaintext value sitting in the page's JavaScript.
- **Owner access** uses a separate bcrypt-hashed password (bootstrapped to
  the initial owner credential on a fresh database), a signed `owner` role
  session, and owner-only Software Control and Security Settings pages.
- **Software Control** is persisted server-side. When it is OFF, employee
  lookup, location verification, attendance actions, and normal admin login
  are blocked with `System is currently disabled. Please contact the
  administrator.` The special owner login remains available so the owner can
  restore service.
- **Attendance photos** are uploaded to the server and stored as files in
  `uploads/attendance/`, with only the file name saved in the database.
- All security-sensitive decisions (is this employee active, is this GPS
  point close enough, has this employee already checked in/out today, what
  time is it) are decided by the server using the server's own clock — not
  values sent from the browser.

## 1. Install

```bash
npm install
```

Node.js 22 or newer is required by the current `better-sqlite3` dependency.

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random string. You can generate
one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The office GPS location and 100m radius are already filled in with your
values and can be changed later from the Settings page (or in `.env` before
the first run).

## 3. Create the database and the first admin account

```bash
npm run migrate
npm run create-admin
```

`create-admin` will ask you to choose a username (default `admin`) and a
passcode. This is what you'll type on the "Admin sign in" screen — it's
stored securely hashed, never in plain text.

The owner signs in from the same screen with the separate owner credential.
On a fresh database it is bootstrapped from a bcrypt hash (never sent to the
frontend); change it immediately from the owner-only **Security Settings**
page using the current, new, and confirmation fields. `OWNER_PASSWORD_HASH`
may be supplied in the environment to replace the bootstrap hash for a
deployment without exposing a password in source.

## 4. Run it

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser. The deployment uses the
same-origin `/api` paths, so no localhost API URL is embedded in the frontend.

- Employees use the main screen to mark attendance (ID → GPS check → camera).
- Click **"Admin sign in"** at the bottom of the portal screen to reach the
  dashboard, employees, leave/off, reports and settings pages.

If you ever need to change the admin passcode later, sign in and use the
**Settings** page — leave the passcode field blank to keep the current one.

## Project structure

```
GBM-Attendance/
├── server/
│   ├── server.js           # Express app entry point
│   ├── database/           # SQLite connection + automatic migrations
│   ├── routes/              # /api/auth, /api/employees, /api/attendance, ...
│   ├── middleware/          # auth, rate limiting, file upload
│   ├── services/            # business logic (employees, attendance, leave, settings)
│   ├── utils/                # geo distance (Haversine), date/time helpers
│   └── scripts/create-admin.js
├── public/
│   └── index.html            # the frontend (unchanged UI, now calls the API)
├── uploads/attendance/       # uploaded attendance photos
├── data/                     # SQLite database file lives here
├── package.json
└── .env.example
```

## API overview

```
POST   /api/auth/login              sign in (rate-limited)
POST   /api/auth/logout
GET    /api/auth/me                 check current session
GET    /api/owner/software-status   owner-only software status
PUT    /api/owner/software-status   owner-only software toggle
PUT    /api/owner/password          owner-only password change

GET    /api/employees/lookup/:id    public — used by the portal ID field
GET    /api/employees               admin
POST   /api/employees               admin
PUT    /api/employees/:id           admin
DELETE /api/employees/:id           admin

GET    /api/attendance/status/:id   public — today's check-in/out status
POST   /api/attendance/verify-location   public — server-side GPS check
POST   /api/attendance              public — submit check-in/out + photo
GET    /api/attendance              admin — full history
GET    /api/attendance/photo/:id    admin — streams a stored photo

GET    /api/leave                   admin
POST   /api/leave                   admin

GET    /api/settings/public         public — company name & office hours
GET    /api/settings                admin — full settings
PUT    /api/settings                admin — update settings / passcode

GET    /api/reports/attendance
GET    /api/reports/employee/:employeeId
```

## Deploying for free (Render.com)

[Render](https://render.com) has a genuine free tier for Node.js web
services — no credit card needed, free HTTPS, and it's simple enough for a
beginner. Here's the whole process:

### 1. Put the project on GitHub

Render deploys from a Git repository. If you don't already have one:

```bash
cd GBM-Attendance
git init
git add .
git commit -m "Initial commit"
```

Create a new empty repository on [github.com](https://github.com/new), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

### 2. Create the Render web service

1. Sign up at [render.com](https://render.com) (no card required) and click
   **New +** → **Web Service**.
2. Connect your GitHub repo.
3. Fill in:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Add environment variables (Render's "Environment" tab) — same names as
   in `.env.example`:
   - `JWT_SECRET` → a long random string (generate one the same way as
     locally: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `OFFICE_LAT`, `OFFICE_LNG`, `OFFICE_RADIUS_METERS` → your office GPS values
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` → your chosen admin login. Render's
     free tier doesn't give you a terminal, so the server auto-creates this
     admin account on its very first boot instead of you running
     `npm run create-admin`. (Once it's created, you can remove these two
     variables if you like — they only ever do anything if no admin exists yet.)
   - You do **not** need to set `PORT` — Render sets it automatically and the
     app already reads it.
5. Click **Create Web Service**. Render will build and deploy it, and give
   you a URL like `https://your-app-name.onrender.com`.

Open that URL — that's your live app, working exactly like it did locally,
with a valid HTTPS certificate (required for the browser's GPS permission
prompt to work).

### Good to know about the free tier

- **It sleeps.** A free service spins down after 15 minutes with no traffic
  and takes 30–60 seconds to wake up on the next visit. That's normal, not
  a bug — the employee just needs to wait a moment on the first attendance
  mark of the day if nobody's used it recently.
- **Storage resets on redeploy, not on sleep.** The SQLite database and
  uploaded photos survive the service sleeping/waking, but a fresh `git push`
  (a new deploy) wipes the disk and starts clean. This is fine while you're
  testing; once you're using it for real attendance data you don't want to
  lose, upgrade that one service to Render's cheapest paid tier (currently
  $7/month) and attach a persistent disk under **Disks** in its settings —
  everything else about the setup stays the same.

## Notes for going further

- The SQLite file and uploaded photos live outside `node_modules`, so back
  them up together if you move servers.
- `data/` and `uploads/attendance/` are `.gitignore`d along with `.env` —
  never commit real attendance data or secrets.
- This is a single-admin design, matching the original app's one shared
  passcode. If you need multiple named admin accounts later, the `admins`
  table already supports more than one row.
