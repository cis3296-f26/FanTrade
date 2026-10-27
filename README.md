# FanTrade

## Project Description

FanTrade is a fantasy football project that brings together Sleeper league information and NFL play-by-play data to support trade analysis.

The current proof of concept includes a Flask application with endpoints for viewing Sleeper league information and NFL play-by-play summaries.

## Installation Instructions

### Prerequisites

- Git
- Python 3 with pip and virtual environment support
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

With the virtual environment active, run:

```bash
python -m pip install -r requirements.txt
```

The dependency file includes Flask, requests, nfl_data_py, and pandas.

## Build Instructions

The current Python/Flask application does not require a separate compilation or frontend build step. Complete the dependency installation above before running the application.

Check the installed dependencies with:

```bash
python -m pip check
```

A successful check displays:

```text
No broken requirements found.
```

This checks dependency compatibility, not application functionality.

## Run Instructions

From the FanTrade directory, with the virtual environment active, run:

```bash
python app.py
```

Open the application in a browser:

http://127.0.0.1:5000

The home page displays **FanTrade Demo** with links to the Sleeper and NFL play-by-play demos. Keep the terminal running while using the application.

### Use the Demo Endpoints

The data endpoints return JSON, which can be viewed directly in the browser.

| Endpoint | Description |
|---|---|
| `/` | Displays the demo home page. |
| `/sleeper` | Returns the current NFL state, including season and week information. |
| `/sleeper?username=YOUR_USERNAME` | Returns user and league information for the supplied Sleeper username. |
| `/pbp?team=PHI&season=2025` | Returns a play-by-play summary and sample plays for Philadelphia games in the 2025 season. |

To look up Sleeper leagues, replace `YOUR_USERNAME` in the address below with an existing Sleeper username:

```text
http://127.0.0.1:5000/sleeper?username=YOUR_USERNAME
```

To try the NFL play-by-play demo, open:

http://127.0.0.1:5000/pbp?team=PHI&season=2025

Change `team` to another NFL team abbreviation or `season` to the desired year. The response includes the season, team, summary statistics, and sample plays.

The first play-by-play request for a season may take longer because the application downloads the data. Subsequent requests reuse the data while the application remains running.

If data cannot be loaded for a requested season other than 2025, the current implementation attempts to use 2025 data. Check the response's `season` field to confirm which season was returned.

### Stop the Application

Press **Control+C** in the terminal to stop the server.

To exit the virtual environment, run:

```bash
deactivate
```

### Run the Application Again

For later sessions, activate the existing virtual environment and start the application.

On macOS or Linux:

```bash
source .venv/bin/activate
python app.py
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
python app.py
```

If `requirements.txt` changes after pulling new code, reinstall dependencies before starting the application:

```bash
python -m pip install -r requirements.txt
```

For full local testing, please run the following command:

```bash
npx vercel dev
```

## Deployment

The application is deployed to vercel.
URL:
https://fan-trade.vercel.app