# FanTrade

## Project Description

FanTrade is a fantasy football project that brings together Sleeper league information and NFL play-by-play data to support trade analysis.

The current proof of concept includes a Flask backend (in `backend/`) with API endpoints for viewing Sleeper league information and NFL play-by-play summaries, and a Vite + React frontend (in `frontend/`) that calls those endpoints.

## Project Structure

```text
FanTrade/
├── backend/        Flask API (app.py, requirements.txt, data connection modules)
├── frontend/       Vite + React app
└── vercel.json     Vercel Services configuration (deploys both as one project)
```

All Flask routes live under the `/api` prefix. The frontend should call them with relative URLs (for example `fetch("/api/sleeper")`) and never hardcode `localhost` or a port.

## Installation Instructions

### Prerequisites

- Git
- Python 3 with pip and virtual environment support
- Node.js and npm (for the frontend)
- An internet connection to install dependencies and retrieve data

Local setup was verified on macOS using Python 3.9.6.

The current demo does not require API keys or environment variables. An existing Sleeper username is needed to look up a user's leagues.

### Clone the Repository

```bash
git clone https://github.com/cis3296-f26/FanTrade.git
cd FanTrade
```

### Create and Activate a Virtual Environment

A virtual environment keeps the project's Python dependencies separate from other projects.

On macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

On Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### Install Dependencies

With the virtual environment active, install the backend dependencies:

```bash
python -m pip install -r backend/requirements.txt
```

The dependency file includes Flask, requests, nfl_data_py, and pandas.

Then install the frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

## Build Instructions

The Flask backend does not require a separate compilation step. Complete the dependency installation above before running the application.

Check the installed Python dependencies with:

```bash
python -m pip check
```

A successful check displays:

```text
No broken requirements found.
```

This checks dependency compatibility, not application functionality.

To create a production build of the frontend (output goes to `frontend/dist`):

```bash
cd frontend
npm run build
```

Vercel runs this build automatically on deploy, so you only need it to verify the build locally.

## Run Instructions

Run the backend and the frontend in two separate terminals. Both need to be running.

**Terminal 1: Flask backend.** From the FanTrade directory, with the virtual environment active:

```bash
python backend/app.py
```

The API runs at http://127.0.0.1:5001. It uses port 5001 instead of Flask's default 5000 because macOS AirPlay Receiver occupies port 5000 and will answer with `403 Forbidden`.

**Terminal 2: Vite frontend.**

```bash
cd frontend
npm run dev
```

Open the application in a browser:

http://localhost:5173

The Vite dev server forwards any request starting with `/api` to the Flask backend on port 5001 (configured in `frontend/vite.config.js`). If you change the Flask port, update the proxy target to match, then restart `npm run dev`, since Vite only reads its config at startup. Keep both terminals running while using the application.

### Check the Frontend and Backend Connection

To confirm Flask is running, open or curl:

```text
http://127.0.0.1:5001/api/health
```

It should return `{"status":"ok"}`. To confirm the proxy is working, request the same route through the frontend server:

```bash
curl -i http://localhost:5173/api/health
```

A `403` with `Server: AirTunes` means requests are still going to port 5000 and the proxy needs to be pointed at 5001 and Vite restarted.

### Use the Demo Endpoints

The data endpoints return JSON, which can be viewed directly in the browser. Open them on the Flask server (port 5001), or on the frontend server (port 5173), which proxies them.

| Endpoint | Description |
|---|---|
| `/api/health` | Returns `{"status":"ok"}` to confirm the backend is running. |
| `/api/sleeper` | Returns the current NFL state, including season and week information. |
| `/api/sleeper?username=YOUR_USERNAME` | Returns user and league information for the supplied Sleeper username. |
| `/api/pbp?team=PHI&season=2025` | Returns a play-by-play summary and sample plays for Philadelphia games in the 2025 season. |

To look up Sleeper leagues, replace `YOUR_USERNAME` in the address below with an existing Sleeper username:

```text
http://127.0.0.1:5001/api/sleeper?username=YOUR_USERNAME
```

To try the NFL play-by-play demo, open:

http://127.0.0.1:5001/api/pbp?team=PHI&season=2025

Change `team` to another NFL team abbreviation or `season` to the desired year. The response includes the season, team, summary statistics, and sample plays.

The first play-by-play request for a season may take longer because the application downloads the data. Subsequent requests reuse the data while the application remains running.

If data cannot be loaded for a requested season other than 2025, the current implementation attempts to use 2025 data. Check the response's `season` field to confirm which season was returned.

### Stop the Application

Press **Control+C** in each terminal (backend and frontend) to stop the servers.

To exit the virtual environment, run:

```bash
deactivate
```

### Run the Application Again

For later sessions, activate the existing virtual environment and start both servers.

On macOS or Linux:

```bash
source .venv/bin/activate
python backend/app.py
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
python backend/app.py
```

Then, in a second terminal:

```bash
cd frontend
npm run dev
```

If `backend/requirements.txt` changes after pulling new code, reinstall the Python dependencies before starting the application:

```bash
python -m pip install -r backend/requirements.txt
```

If `frontend/package.json` changes, run `npm install` in `frontend/` as well.

For full local testing that mirrors the production setup (both services behind one URL), please run the following command:

```bash
npx vercel dev
```

## Deployment

The application is deployed to vercel as a single project that hosts both the frontend and the backend on one domain. This is configured with Vercel Services in the `vercel.json` file at the repository root:

- `frontend/` is built as the Vite app and serves every non-API path.
- `backend/` runs the Flask app (entrypoint `app:app`) and serves every path starting with `/api`.

Because both are on the same domain, no CORS configuration is needed. Pushing to GitHub triggers an automatic deployment, and branches get preview URLs.

In the Vercel project settings, the Root Directory should be the repository root (left blank), and the Framework Preset should be set to Services.

Notes for developers:

- Flask routes must keep the `/api` prefix, because Vercel passes the full request path to Flask.
- Vercel's serverless filesystem is read-only, so the backend can't rely on writing local files (such as SQLite) and the in-memory play-by-play cache is not guaranteed to persist between requests.
- Preview deployment URLs are protected by Vercel Authentication, so they require a Vercel login to open.

URL:
https://fan-trade.vercel.app