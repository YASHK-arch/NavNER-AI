import asyncio
import json
import logging
from datetime import datetime, timezone
import aiohttp

from app.websocket import manager

logger = logging.getLogger(__name__)

# A predefined route in the NER region (e.g., Guwahati to Shillong area)
# We will use OSRM API to get the exact polyline between these two points
ORIGIN = "91.7362,26.1445" # Guwahati
DEST = "91.8933,25.5788"   # Shillong
OSRM_URL = f"http://router.project-osrm.org/route/v1/driving/{ORIGIN};{DEST}?overview=full&geometries=geojson"

async def fetch_route():
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(OSRM_URL) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("routes") and len(data["routes"]) > 0:
                        return data["routes"][0]["geometry"]["coordinates"]
    except Exception as e:
        logger.error(f"[TelemetrySimulator] Failed to fetch OSRM route: {e}")
    
    # Fallback to a simple straight line if OSRM fails
    logger.warning("[TelemetrySimulator] Using fallback straight-line route")
    return [
        [91.7362, 26.1445],
        [91.7755, 26.0028],
        [91.8148, 25.8611],
        [91.8541, 25.7194],
        [91.8933, 25.5788]
    ]

async def run_telemetry_simulator():
    logger.info("[TelemetrySimulator] Starting live mock data ingestion loop...")
    coordinates = await fetch_route()
    
    if not coordinates:
        logger.error("[TelemetrySimulator] No coordinates available. Stopping simulator.")
        return

    idx = 0
    total = len(coordinates)
    direction = 1
    
    while True:
        coord = coordinates[idx]
        
        # Broadcast the mock location
        await manager.broadcast({
            "event": "telemetry_update",
            "data": {
                # We use a static UUID that matches our seeded vehicle
                # In seed.py, "TRK-1001" has ID: 10000000-0000-0000-0000-000000000001
                "vehicle_id": "10000000-0000-0000-0000-000000000001",
                "lat": coord[1],
                "lng": coord[0],
                "speed": 45.0,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        })
        
        # Advance the truck
        idx += direction
        if idx >= total - 1:
            direction = -1
        elif idx <= 0:
            direction = 1
            
        await asyncio.sleep(2)
