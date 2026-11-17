# Sweety — Blood Glucose Tracker

A small web app where a diabetes patient records up to **4 blood glucose readings a day** and views **daily, month-to-date and monthly reports**. Built for the Kenpath Junior Full Stack Developer assessment.

**Stack:** Node.js + Express API · PostgreSQL (`pg`) · React frontend (Vite) · JWT auth · bcrypt password hashing.

## What it does

- **Sign up / log in** — passwords are hashed with bcrypt, never stored in plain text. After login you only see your own readings (JWT auth, per-user data isolation).
- **Add, view, edit and delete readings** — each reading has a date, a time slot and a value in mg/dl. The four slots are: Morning (fasting), After breakfast, After lunch, After dinner.
- **Validation (enforced server-side, exact messages shown in the UI):**
  - Value required → `Please enter a glucose value.`
  - Whole number between 40 and 600 → `Value must be between 40 and 600 mg/dl.`
  - One reading per slot per day → `You already have an After lunch reading for this date.`
  - Maximum 4 readings per day → `You can add only 4 readings per day.`
  - Date cannot be in the future → `Date cannot be in the future.`
- **Reports** — pick a date and see three cards: **Daily** (the selected date, with each reading listed by slot), **Month to date** (1st of the month → selected date), **Monthly** (the whole previous month). Each shows highest, lowest and average (rounded to 1 decimal) and the number of readings; an empty period shows a friendly empty state.
- **Bonus:** pagination on `GET /readings` (`?page=1&limit=20`) and a `docker-compose.yml` that starts PostgreSQL (and the app).

## Quick start

### With PostgreSQL (the real setup)

```bash
# 1. Create the database (PostgreSQL 14+)
createdb sweety

# 2. Server
cd server
cp .env.example .env        # then edit DATABASE_URL + JWT_SECRET
npm install
npm start                   # API on http://localhost:5000

# 3. Seed demo data (in a second terminal, with the server running)
npm run seed                # demo login: demo@sweety.app / demo1234

# 4. Client (in a third terminal)
cd ../client
npm install
npm run dev                 # app on http://localhost:5173
```

### Without PostgreSQL (demo mode)

No PostgreSQL installed? The server can run against an in-memory
PostgreSQL emulator for a quick demo — same SQL, same API:

```bash
cd server
cp .env.example .env
USE_MEMORY_DB=true npm start
npm run seed
```

> Demo mode is for trying the app out only. Real use should point `DATABASE_URL` at PostgreSQL (see `.env.example`). Data in demo mode disappears when the server stops.

### With Docker (not yet run on this machine — see Notes)

```bash
docker compose up --build   # db on :5432, API on :5000, app on :80
```

## How to run the tests

```bash
cd server
npm test                    # 19 tests — validation rules, report maths,
                            # auth, CRUD, pagination, per-user isolation.
                            # Tests run against an in-memory database;
                            # no PostgreSQL needed.
```

## Demo login

After `npm run seed`: **demo@sweety.app / demo1234** — 14 sample readings across the last few days and last month, so every report has data.

## API

Base URL: `http://localhost:5000` (all `/api/*` routes except auth need `Authorization: Bearer <token>`).

| Method | Route | What it does |
| ------ | ----- | ------------ |
| GET | `/api/health` | Health check |
| GET | `/api/slots` | The four time slots |
| POST | `/api/auth/register` | `{name, email, password}` → `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/api/readings?page=1&limit=20` | Your readings, newest first (paginated) |
| POST | `/api/readings` | Add a reading `{date, slot, value}` |
| PUT | `/api/readings/:id` | Edit a reading |
| DELETE | `/api/readings/:id` | Delete a reading |
| GET | `/api/reports?type=daily\|month-to-date\|monthly&date=YYYY-MM-DD` | Report stats + daily reading list |

## Screenshots

In [`screenshots/`](screenshots/):

- `01-login.png` — login screen (with demo-account hint)
- `02-dashboard.png` — dashboard: add-reading form, all three reports, readings list
- `03-validation-error.png` — the exact validation message shown in the UI

## Project structure

```
sweety/
├── server/                 # Express API
│   ├── src/
│   │   ├── index.js        # entry point
│   │   ├── app.js          # routes (auth, readings, reports)
│   │   ├── db.js           # PostgreSQL pool (+ in-memory demo mode)
│   │   ├── auth.js         # JWT helpers + middleware
│   │   ├── validation.js   # validation rules + report maths (shared logic)
│   │   └── seed.js         # demo user + sample readings (via the API)
│   ├── tests/              # node:test + supertest (19 tests)
│   ├── Dockerfile
│   └── .env.example
├── client/                 # React + Vite
│   ├── src/
│   │   ├── App.jsx         # auth screen + dashboard
│   │   ├── api.js          # API client
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── Dockerfile
│   └── vite.config.js      # dev proxy: /api -> localhost:5000
├── docker-compose.yml
└── screenshots/
```

## Notes

**Assumptions**

- A "day" for the 4-readings cap is the calendar date the user picks; readings are stored per user, so two users can each have 4 readings on the same date.
- "Monthly" means the whole previous calendar month relative to the selected date (e.g. selecting 15 Oct 2026 shows 1–30 Sep 2026), as in the assignment example.
- When a day already has 4 readings, a 5th attempt reports the daily-cap message (checked before the duplicate-slot message, so both messages are reachable).
- Dates are validated against the server's local date for the "not in the future" rule.
- The seed script seeds through the public API rather than direct SQL, so it works identically against real PostgreSQL and the in-memory demo database.

**What I'd improve with more time**

- Charts: a line chart of readings over the month (e.g. Recharts).
- Frontend tests with React Testing Library for the reading form.
- A "streaks / in-range %" summary on the dashboard (readings within a healthy range).
- Email verification and password reset for accounts.
- Deploy the app (e.g. Render/Fly.io) with a hosted PostgreSQL database.

**Environment note:** this repo was built and verified on a machine without PostgreSQL or Docker installed, so the live verification used the in-memory demo mode (`USE_MEMORY_DB=true`) and the 19 automated tests (which also run against the in-memory database). The SQL is standard PostgreSQL (`pg` driver, `DATABASE_URL`) and the `docker-compose.yml` was written but not executed here — please run `docker compose up --build` to verify it in an environment with Docker.
