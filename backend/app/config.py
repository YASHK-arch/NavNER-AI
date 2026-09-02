"""Application settings loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuration pulled from .env or environment variables."""

    DATABASE_URL: str = (
        "postgresql+psycopg://navner:navner_secret@localhost:5432/navner_ai"
    )
    UPLOAD_DIR: str = "./uploads"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174,http://localhost:3000,http://localhost:8081"
    SNS_TOPIC_ARN: str | None = None
    GROQ_API_KEY: str | None = None

    # ── Fleet-Manager database (issue #74 follow-up) ───────────────────────
    # Deliberately a second, separate database rather than a schema in the
    # same one. The Fleet Manager portal is the government provisioning
    # source of truth (issue #65 §3.3: "the fleet-manager portal acts as the
    # source of truth ... the navNER dashboard consumes" it) — a distinct
    # system of record, not a table in NavNER's operational store. It holds
    # only provisioning records (no geometry, no telemetry, no images), so a
    # plain hosted Postgres instance is enough; it does not need PostGIS.
    #
    # Locally this defaults to a second database on the same Postgres server
    # so the split is real and testable without a cloud account. In
    # production each of DATABASE_URL and GOVT_DATABASE_URL points at its own
    # Supabase project — see docs/database-architecture.md.
    GOVT_DATABASE_URL: str = (
        "postgresql+psycopg://navner:navner_secret@localhost:5432/fleet_manager_db"
    )

    # ── Satellite / SMS incident bridge (issue #74) ────────────────────────
    # Twilio simulates the satellite-SMS link for the demo. Signature
    # validation is opt-in: it needs a real Twilio account and a public
    # webhook URL, neither of which exists in local dev. Enable it before any
    # deployment that has a real inbound number.
    TWILIO_AUTH_TOKEN: str | None = None
    TWILIO_VALIDATE_SIGNATURE: bool = False
    TWILIO_SMS_NUMBER: str | None = None

    # ── Telemetry simulation (demo / local development) ───────────────────
    # Off by default: enabling it writes vehicle positions, so it must never
    # start implicitly against a database holding real telemetry.
    SIMULATE_TELEMETRY: bool = False
    SIM_INTERVAL_SECONDS: int = 2
    SIM_SPEED_KMPH: float = 45.0
    SIM_VEHICLE_LIMIT: int = 3
    # Broadcast every tick, but persist a Telemetry row every Nth tick.
    SIM_TELEMETRY_EVERY: int = 5
    SIM_ROUTE_CACHE: str = "./.cache/osrm_corridor.json"
    OSRM_BASE_URL: str = "https://router.project-osrm.org"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
