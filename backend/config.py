"""
CHIMERA Live Data Recorder — Configuration
============================================
Centralised configuration for the recorder.
All settings are environment-driven with sensible defaults.
Runtime settings can be updated via the API and persisted to disk.
"""

import os
import json
import logging
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger("config")

RUNTIME_CONFIG_FILE = Path(
    os.environ.get("RUNTIME_CONFIG_FILE", "/tmp/chimera_recorder_config.json")
)


@dataclass
class BetfairConfig:
    """Betfair API authentication and connection settings."""
    app_key: str = ""
    ssoid: str = ""  # Session token (X-Authentication header)


@dataclass
class GCSConfig:
    """Google Cloud Storage settings."""
    project_id: str = ""
    bucket_name: str = ""
    base_path: str = "betfair-live"  # Root path prefix inside the bucket


@dataclass
class RecorderConfig:
    """Core recorder behaviour settings."""
    poll_interval_seconds: int = 60
    countries: list = field(default_factory=lambda: ["GB", "IE"])
    event_type_id: str = "7"  # Horse Racing
    market_types: list = field(default_factory=lambda: [])  # Empty = ALL types
    price_projection: list = field(
        default_factory=lambda: [
            "EX_BEST_OFFERS",
            "EX_ALL_OFFERS",
            "EX_TRADED",
            "SP_AVAILABLE",
            "SP_TRADED",
        ]
    )
    max_markets_per_request: int = 6  # Betfair weight limit safeguard
    catalogue_projections: list = field(
        default_factory=lambda: [
            "EVENT",
            "EVENT_TYPE",
            "COMPETITION",
            "MARKET_START_TIME",
            "MARKET_DESCRIPTION",
            "RUNNER_DESCRIPTION",
            "RUNNER_METADATA",
        ]
    )


@dataclass
class AppConfig:
    """Top-level application configuration."""
    betfair: BetfairConfig = field(default_factory=BetfairConfig)
    gcs: GCSConfig = field(default_factory=GCSConfig)
    recorder: RecorderConfig = field(default_factory=RecorderConfig)
    frontend_url: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def to_safe_dict(self) -> dict:
        """Return config without sensitive fields for the frontend."""
        d = self.to_dict()
        if d["betfair"]["ssoid"]:
            d["betfair"]["ssoid"] = f"...{d['betfair']['ssoid'][-8:]}"
        return d

    def save(self):
        """Persist runtime config to disk."""
        try:
            RUNTIME_CONFIG_FILE.write_text(json.dumps(self.to_dict(), indent=2))
            logger.info("Runtime config saved")
        except Exception as e:
            logger.warning(f"Failed to save runtime config: {e}")

    @classmethod
    def load(cls) -> "AppConfig":
        """Load config from environment variables, then overlay runtime file."""
        config = cls()

        # ── Load from environment variables first ──
        config.betfair.app_key = os.environ.get("BETFAIR_APP_KEY", "")
        config.betfair.ssoid = os.environ.get("BETFAIR_SSOID", "")
        config.gcs.project_id = os.environ.get("GCS_PROJECT_ID", "")
        config.gcs.bucket_name = os.environ.get("GCS_BUCKET_NAME", "")
        config.gcs.base_path = os.environ.get("GCS_BASE_PATH", "betfair-live")
        config.frontend_url = os.environ.get(
            "FRONTEND_URL", "https://recorder.thync.online"
        )
        interval = os.environ.get("POLL_INTERVAL", "60")
        config.recorder.poll_interval_seconds = int(interval)

        # ── Overlay runtime config file if it exists ──
        try:
            if RUNTIME_CONFIG_FILE.exists():
                data = json.loads(RUNTIME_CONFIG_FILE.read_text())
                _merge_config(config, data)
                logger.info("Runtime config loaded from disk")
        except Exception as e:
            logger.warning(f"Failed to load runtime config: {e}")

        return config


def _merge_config(config: AppConfig, data: dict):
    """Merge a dict into the config, overwriting non-empty values."""
    bf = data.get("betfair", {})
    if bf.get("app_key"):
        config.betfair.app_key = bf["app_key"]
    if bf.get("ssoid"):
        config.betfair.ssoid = bf["ssoid"]

    gcs = data.get("gcs", {})
    if gcs.get("project_id"):
        config.gcs.project_id = gcs["project_id"]
    if gcs.get("bucket_name"):
        config.gcs.bucket_name = gcs["bucket_name"]
    if gcs.get("base_path"):
        config.gcs.base_path = gcs["base_path"]

    rec = data.get("recorder", {})
    if rec.get("poll_interval_seconds"):
        config.recorder.poll_interval_seconds = int(rec["poll_interval_seconds"])
    if rec.get("countries"):
        config.recorder.countries = rec["countries"]
    if rec.get("market_types") is not None:
        config.recorder.market_types = rec["market_types"]
    if rec.get("price_projection"):
        config.recorder.price_projection = rec["price_projection"]

    if data.get("frontend_url"):
        config.frontend_url = data["frontend_url"]
