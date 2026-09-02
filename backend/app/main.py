"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import async_session, engine
from app.models import Base
from app.routers import (
    analytics,
    dashboard,
    govt,
    incidents,
    map_state,
    routing,
    sms,
    telemetry,
)
from app.scheduler import start_scheduler, stop_scheduler
from app.seed import seed_demo_data
from app.websocket import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables, seed demo data, and start scheduler on startup."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            print("✅ PostGIS extension verified.")
        except Exception as e:
            print("⚠️ Could not create PostGIS extension (it may already exist):", e)
            
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables created.")

    async with async_session() as session:
        await seed_demo_data(session)

    # Start the periodic risk evaluation scheduler (every 30 minutes)
    start_scheduler()
    print("✅ Risk evaluation scheduler started.")

    yield

    stop_scheduler()
    await engine.dispose()


app = FastAPI(
    title="NavNER-AI Backend",
    description="AI-powered logistics intelligence platform for NER — Stage 1, 2, 3 & 4 API",
    version="0.4.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
# In local development the Vite dev server can land on any nearby port (5173,
# 5174, …) depending on what is already occupied.  Rather than maintain a fixed
# allow-list that silently breaks whenever the port shifts, we open CORS fully
# while the backend is running on localhost.  The allow_credentials flag below
# means we cannot use allow_origins=["*"] together with credentials, so we
# enumerate common dev origins instead and fall back to the env-driven list for
# production.
_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    "http://localhost:8081",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS + settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static file serving for uploads ────────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(telemetry.router)
app.include_router(incidents.router)
app.include_router(map_state.router)
app.include_router(analytics.router)
app.include_router(routing.router)
app.include_router(dashboard.router)
app.include_router(govt.router)
app.include_router(sms.router)


# ── WebSocket endpoint ─────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for live dashboard updates."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive; we only broadcast server→client
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Stage 3: Fleet Monitor WebSocket ──────────────────────────────────────
@app.websocket("/api/v1/ws/fleet-monitor")
async def fleet_monitor_ws(websocket: WebSocket):
    """Dedicated WebSocket for fleet reroute alerts and trip status updates."""
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Health check ───────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "service": "navner-ai-backend", "version": "0.4.0"}
# Trigger reload
