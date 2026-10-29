# Deadlock Visualizer and Recovery Simulator

Interactive teaching app for process/resource management, resource allocation graphs, Work/Finish deadlock detection, recovery strategy comparison, Banker's safety checks, and event history.

**Stack:** React + Vite, Flask API, SQLite.

## Run locally

Install Python 3.10+ and Node.js 20+.

```powershell
cd vs
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m api.app
```

In another terminal:

```powershell
cd vs/frontend
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. Vite proxies `/api` requests to Flask on port 5000.

## Deploy on Vercel

Import the Git repository into Vercel with the repository root (`./`) selected. Vercel builds the `frontend` and Flask `app` services from the included `vercel.json`; `/api/*` requests go to Flask and all other paths go to the React client.

SQLite is used for the local simulator. Vercel Functions use temporary serverless storage, so use a hosted database if you need history and scenario changes to persist across deployments or function instances.

## Modules

- Process and resource management
- User-created process and resource scenarios with editable Banker’s maximum claims
- Resource allocation graph builder
- Work/Finish deadlock detection
- Victim, all-process, and stepwise recovery with what-if previews
- Banker's safety algorithm
- SQLite event history and dashboard reporting
