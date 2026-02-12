# CHIMERA Live Data Recorder

Standalone app within the Chimera Platform that connects to Betfair's Live API, polls every minute for UK/IE horse racing data, saves to Google Cloud Storage in NDJSON format, and serves a data feed for the Lay Bet App.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────┐
│  React/Vite Frontend│────▶│  FastAPI Backend      │────▶│  Betfair │
│  (Cloudflare Pages) │     │  (Cloud Run)          │     │  Live API│
└─────────────────────┘     │                       │     └──────────┘
                            │  ┌─────────────────┐  │
                            │  │ Recorder Engine  │──┼───▶ GCS (NDJSON)
                            │  └─────────────────┘  │
                            │  ┌─────────────────┐  │
                            │  │ Feed API         │◀─┼──── Lay Bet App
                            │  └─────────────────┘  │
                            └──────────────────────┘
```

## Quick Start (Local Dev)

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # edit with your credentials
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Deployment

### Backend → Google Cloud Run

```bash
cd backend

# Build and push
gcloud builds submit --tag gcr.io/YOUR_PROJECT/chimera-recorder

# Deploy
gcloud run deploy chimera-recorder \
  --image gcr.io/YOUR_PROJECT/chimera-recorder \
  --region europe-west2 \
  --allow-unauthenticated \
  --memory 512Mi \
  --min-instances 1 \
  --max-instances 1 \
  --set-env-vars "FRONTEND_URL=https://your-domain.pages.dev"
```

### Frontend → Cloudflare Pages

1. Push to GitHub
2. In Cloudflare Pages, connect the repo
3. Build settings:
   - **Root**: `frontend`
   - **Build command**: `npm run build`
   - **Output**: `dist`
4. Environment variable: `VITE_API_URL=https://chimera-recorder-xxxxx.run.app`

### Cloud Scheduler (Keep-Warm)

```bash
gcloud scheduler jobs create http chimera-recorder-warmup \
  --schedule "*/10 * * * *" \
  --uri "https://chimera-recorder-xxxxx.run.app/api/keepalive" \
  --http-method GET \
  --location europe-west2
```

## GCS Storage Format

```
gs://{bucket}/{base_path}/7/{YYYY-MM-DD}/
  ├── catalogue/{HH-MM-SS}.ndjson
  └── books/{HH-MM-SS}.ndjson
```

Each `.ndjson` file contains one JSON object per line (one market per line), enriched with `_recorded_at` and `_data_type` metadata.

## Feed API (Lay Bet App Integration)

The recorder exposes endpoints that mirror Betfair's response format:

| Endpoint | Method | Description |
|---|---|---|
| `/api/feed/markets` | GET | Cached market catalogue |
| `/api/feed/book/{id}` | GET | Single market book |
| `/api/feed/books` | POST | Multiple market books |

To integrate, change the Lay Bet App's API base URL to point to the recorder.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BETFAIR_APP_KEY` | Yes | — | Betfair application key |
| `BETFAIR_SSOID` | No | — | Session token (set via UI) |
| `GCS_PROJECT_ID` | Yes | — | GCP project ID |
| `GCS_BUCKET_NAME` | Yes | — | GCS bucket name |
| `GCS_BASE_PATH` | No | `betfair-live` | Root path prefix |
| `FRONTEND_URL` | No | `http://localhost:5173` | CORS origin |
| `POLL_INTERVAL` | No | `60` | Seconds between polls |
| `VITE_API_URL` | No | — | Backend URL (frontend) |
