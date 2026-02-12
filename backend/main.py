"""
CHIMERA DataPulse — API Server
================================
FastAPI backend for Cloud Run (europe-west2).
Frontend served from Cloudflare Pages.

Endpoints:
  /api/health          - Health check
  /api/keepalive       - Cloud Run warmup
  /api/login           - Betfair authentication (credentials or SSOID)
  /api/logout          - Clear session
  /api/config          - Get/update configuration
  /api/state           - Full engine state for dashboard
  /api/engine/start    - Start recording
  /api/engine/stop     - Stop recording
  /api/feed/markets    - Lay Bet App data feed (markets)
  /api/feed/market-book - Lay Bet App data feed (market books)
"""

import os
import logging
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from data_recorder import DataRecorder

# Load .env if present (local dev)
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="CHIMERA DataPulse", version="1.0.0")

# ── CORS: Allow Cloudflare Pages frontend + local dev ──
# Set FRONTEND_URL to your exact Cloudflare Pages domain, or use "*" to allow all
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://datapulse.thync.online")
EXTRA_ORIGINS = os.environ.get("EXTRA_CORS_ORIGINS", "")  # comma-separated

cors_origins = [
    FRONTEND_URL,
    "https://layengine.thync.online",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]

# Add any extra origins from env (e.g. Cloudflare Pages preview URLs)
if EXTRA_ORIGINS:
    cors_origins.extend([o.strip() for o in EXTRA_ORIGINS.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.pages\.dev",  # All Cloudflare Pages preview URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Engine singleton ──
engine = DataRecorder()

# Pre-configure from environment variables if available
engine.configure(
    app_key=os.environ.get("BETFAIR_APP_KEY", ""),
    gcs_project=os.environ.get("GCS_PROJECT", ""),
    gcs_bucket=os.environ.get("GCS_BUCKET", ""),
    gcs_credentials=os.environ.get("GCS_CREDENTIALS", ""),
    poll_interval=int(os.environ.get("POLL_INTERVAL", "60")),
)


# ── Request models ──
class LoginCredentialsRequest(BaseModel):
    username: str
    password: str


class LoginSSOIDRequest(BaseModel):
    ssoid: str


class ConfigRequest(BaseModel):
    app_key: Optional[str] = None
    gcs_project: Optional[str] = None
    gcs_bucket: Optional[str] = None
    gcs_credentials: Optional[str] = None
    poll_interval: Optional[int] = None


class MarketBookRequest(BaseModel):
    market_ids: list[str]


# ──────────────────────────────────────────────
#  HEALTH & KEEPALIVE
# ──────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "engine": engine.status, "service": "datapulse"}


@app.get("/api/keepalive")
def keepalive():
    """Cloud Run warmup endpoint."""
    return {
        "status": "ok",
        "engine": engine.status,
        "authenticated": engine.is_authenticated,
        "poll_cycle": engine.poll_cycle,
        "active_markets": len(engine._active_market_ids),
        "total_snapshots": engine.total_snapshots,
    }


# ──────────────────────────────────────────────
#  AUTHENTICATION
# ──────────────────────────────────────────────

@app.post("/api/login/credentials")
def login_credentials(req: LoginCredentialsRequest):
    """Authenticate with Betfair using username/password."""
    success, error = engine.login_credentials(req.username, req.password)
    if success:
        return {"status": "ok", "balance": engine.balance}
    return JSONResponse(
        status_code=401,
        content={"status": "error", "message": f"Login failed: {error}"},
    )


@app.post("/api/login/ssoid")
def login_ssoid(req: LoginSSOIDRequest):
    """Authenticate using a pre-existing SSOID."""
    success, error = engine.login_ssoid(req.ssoid)
    if success:
        return {"status": "ok", "balance": engine.balance}
    return JSONResponse(
        status_code=401,
        content={"status": "error", "message": f"SSOID validation failed: {error}"},
    )


@app.post("/api/logout")
def logout():
    """Clear credentials and stop engine."""
    engine.logout()
    return {"status": "ok"}


# ──────────────────────────────────────────────
#  CONFIGURATION
# ──────────────────────────────────────────────

@app.get("/api/config")
def get_config():
    """Get current configuration (sensitive values masked)."""
    return {
        "app_key": engine.app_key[:8] + "..." if engine.app_key else "",
        "gcs_project": engine.gcs_project,
        "gcs_bucket": engine.gcs_bucket,
        "gcs_credentials": "***" if engine.gcs_credentials else "",
        "poll_interval": engine.poll_interval,
        "gcs_ready": engine.storage.is_ready if engine.storage else False,
    }


@app.post("/api/config")
def update_config(req: ConfigRequest):
    """Update configuration."""
    engine.configure(
        app_key=req.app_key or "",
        gcs_project=req.gcs_project or "",
        gcs_bucket=req.gcs_bucket or "",
        gcs_credentials=req.gcs_credentials or "",
        poll_interval=req.poll_interval or engine.poll_interval,
    )
    return {"status": "ok", "config": get_config()}


@app.post("/api/config/test-gcs")
def test_gcs():
    """Test GCS connection with current configuration."""
    success, error = engine.init_storage()
    if success:
        return {"status": "ok", "message": "GCS connection successful"}
    return JSONResponse(
        status_code=400,
        content={"status": "error", "message": error},
    )


# ──────────────────────────────────────────────
#  ENGINE CONTROL
# ──────────────────────────────────────────────

@app.get("/api/state")
def get_state():
    """Full engine state for the dashboard."""
    return engine.get_state()


@app.post("/api/engine/start")
def start_engine():
    """Start the recording engine."""
    if not engine.is_authenticated:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": "Not authenticated"},
        )
    success, error = engine.start()
    if success:
        return {"status": "ok", "engine": engine.status}
    return JSONResponse(
        status_code=400,
        content={"status": "error", "message": error},
    )


@app.post("/api/engine/stop")
def stop_engine():
    """Stop the recording engine."""
    engine.stop()
    return {"status": "ok", "engine": engine.status}


# ──────────────────────────────────────────────
#  DATA FEED (for Lay Bet App)
# ──────────────────────────────────────────────

@app.get("/api/feed/markets")
def feed_markets():
    """
    Return today's UK/IE WIN markets for the Lay Bet App.
    Format matches BetfairClient.get_todays_win_markets() exactly.
    """
    if not engine.is_authenticated:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": "Not authenticated"},
        )
    markets = engine.get_feed_markets()
    return {"status": "ok", "markets": markets}


@app.post("/api/feed/market-book")
def feed_market_book(req: MarketBookRequest):
    """
    Return latest market book data for the Lay Bet App.
    Format matches Betfair's listMarketBook response exactly.
    """
    if not engine.is_authenticated:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": "Not authenticated"},
        )
    books = engine.get_feed_market_books_batch(req.market_ids)
    return {"status": "ok", "books": books}


@app.get("/api/feed/market-book/{market_id}")
def feed_single_market_book(market_id: str):
    """Return latest market book for a single market."""
    if not engine.is_authenticated:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "message": "Not authenticated"},
        )
    book = engine.get_feed_market_book(market_id)
    if book:
        return {"status": "ok", "book": book}
    return JSONResponse(
        status_code=404,
        content={"status": "error", "message": f"Market {market_id} not found"},
    )