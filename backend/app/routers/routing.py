"""Stage 3 Routing API — Dynamic route calculation and fleet status endpoints."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.functions import ST_AsGeoJSON, ST_GeomFromGeoJSON
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    RoadNetworkEdge,
    RoadStatus,
    RerouteLog,
    SegmentRiskAssessment,
    TripStatus,
    Vehicle,
    VehicleTrip,
)
from app.routing_engine import DynamicGraphRouter
from app.schemas import (
    FleetStatusResponse,
    FleetTripResponse,
    RouteCalculateRequest,
    RouteCalculateResponse,
    RouteGeoJSON,
    TurnByTurnStep,
)
from app.websocket import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/routing", tags=["routing"])


# ── Helper: Build the graph from DB ───────────────────────────────────────────


async def _build_router_from_db(db: AsyncSession) -> DynamicGraphRouter:
    """Load all road network edges from DB and build the graph."""
    stmt = select(
        RoadNetworkEdge.edge_id,
        RoadNetworkEdge.source_node,
        RoadNetworkEdge.target_node,
        RoadNetworkEdge.road_name,
        RoadNetworkEdge.road_class,
        RoadNetworkEdge.length_km,
        RoadNetworkEdge.base_speed_kmh,
        RoadNetworkEdge.base_duration_min,
        RoadNetworkEdge.is_active,
        RoadNetworkEdge.current_status,
        RoadNetworkEdge.current_hazard_penalty,
        ST_AsGeoJSON(RoadNetworkEdge.geom).label("geojson"),
    )
    rows = (await db.execute(stmt)).all()

    edges = []
    for row in rows:
        geom = json.loads(row.geojson)
        status = row.current_status
        if isinstance(status, RoadStatus):
            status = status.value

        edges.append({
            "edge_id": row.edge_id,
            "source_node": row.source_node,
            "target_node": row.target_node,
            "road_name": row.road_name or "",
            "road_class": row.road_class or "",
            "length_km": row.length_km,
            "base_speed_kmh": row.base_speed_kmh,
            "base_duration_min": row.base_duration_min,
            "is_active": row.is_active,
            "current_status": status,
            "current_hazard_penalty": row.current_hazard_penalty or 0.0,
            "coordinates": geom.get("coordinates", []),
        })

    # Build node index from edges + known NER city names
    from app.seed import NER_ROAD_NODES
    nodes = {
        nid: {"name": info["name"], "lng": info["lng"], "lat": info["lat"]}
        for nid, info in NER_ROAD_NODES.items()
    }

    graph_router = DynamicGraphRouter()
    graph_router.build_graph(edges, nodes)
    return graph_router


async def _get_blocked_edge_ids(db: AsyncSession) -> list[int]:
    """Get edge IDs currently marked as BLOCKED."""
    stmt = select(RoadNetworkEdge.edge_id).where(
        RoadNetworkEdge.current_status == RoadStatus.BLOCKED
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def _get_hazard_penalties(db: AsyncSession) -> dict[int, float]:
    """Build edge_id → hazard_penalty map from CRITICAL/HIGH risk cells using PostGIS intersection."""
    from sqlalchemy import func
    from app.models import SpatialGridCell

    stmt = (
        select(
            RoadNetworkEdge.edge_id,
            func.max(SegmentRiskAssessment.landslide_risk_score + SegmentRiskAssessment.flood_risk_score).label("max_risk")
        )
        .join(SpatialGridCell, func.ST_Intersects(RoadNetworkEdge.geom, SpatialGridCell.geom))
        .join(SegmentRiskAssessment, SegmentRiskAssessment.h3_index == SpatialGridCell.h3_index)
        .where(SegmentRiskAssessment.composite_risk_level.in_(["CRITICAL", "HIGH"]))
        .group_by(RoadNetworkEdge.edge_id)
    )

    rows = (await db.execute(stmt)).all()

    edge_penalties: dict[int, float] = {}
    for row in rows:
        penalty = min(row.max_risk / 2.0, 1.0)
        edge_penalties[row.edge_id] = penalty

    return edge_penalties


def _geom_to_geojson(geojson_str: str | None) -> RouteGeoJSON | None:
    """Parse a PostGIS GeoJSON string into a RouteGeoJSON schema."""
    if not geojson_str:
        return None
    try:
        geom = json.loads(geojson_str)
        return RouteGeoJSON(
            type=geom.get("type", "LineString"),
            coordinates=geom.get("coordinates", []),
        )
    except (json.JSONDecodeError, KeyError):
        return None


# ── Endpoint 1: Calculate / Recalculate Route ────────────────────────────────


@router.post("/calculate-route", response_model=RouteCalculateResponse)
async def calculate_route(
    payload: RouteCalculateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Calculate or recalculate the optimal route for a vehicle trip."""
    return await recalculate_trip_route(payload.trip_id, payload.avoid_hazards, db)


async def recalculate_trip_route(
    trip_id: str | uuid.UUID,
    avoid_hazards: bool,
    db: AsyncSession,
    ai_reasoning: str | None = None,
) -> RouteCalculateResponse:
    """Core logic to fetch trip, rebuild graph, calculate optimal path, and notify."""
    # 1. Fetch the trip
    trip = await db.get(VehicleTrip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # 2. Build the routing graph
    graph_router = await _build_router_from_db(db)

    # 3. Gather dynamic cost inputs
    blocked_ids = await _get_blocked_edge_ids(db)
    hazard_penalties = await _get_hazard_penalties(db) if avoid_hazards else {}

    # 4. Apply dynamic costs
    graph_router.apply_dynamic_costs(
        blocked_edge_ids=blocked_ids,
        hazard_penalties=hazard_penalties,
    )

    # 5. Find origin and destination nodes
    origin_geojson = (await db.execute(
        select(ST_AsGeoJSON(trip.origin_coords))
    )).scalar()
    dest_geojson = (await db.execute(
        select(ST_AsGeoJSON(trip.dest_coords))
    )).scalar()

    origin_geom = json.loads(origin_geojson)
    dest_geom = json.loads(dest_geojson)

    origin_node = graph_router.find_nearest_node(
        origin_geom["coordinates"][0], origin_geom["coordinates"][1]
    )
    dest_node = graph_router.find_nearest_node(
        dest_geom["coordinates"][0], dest_geom["coordinates"][1]
    )

    if origin_node is None or dest_node is None:
        raise HTTPException(status_code=400, detail="Could not locate origin/destination on road network")

    # 6. Compute optimal route
    result = graph_router.compute_optimal_route(origin_node, dest_node)
    if result is None:
        return RouteCalculateResponse(
            status="NO_ROUTE_FOUND",
            total_distance_km=0,
            estimated_duration_min=0,
            route_geojson=RouteGeoJSON(coordinates=[]),
            turn_by_turn_instructions=[],
        )

    # 7. Generate turn-by-turn instructions
    instructions = graph_router.generate_turn_by_turn(result["path_nodes"])

    # 8. Determine if this is a reroute (trip already had a route)
    now = datetime.now(timezone.utc)
    previous_duration = None
    delay = None
    status_str = "ROUTE_CALCULATED"

    # Get previous route's duration if exists
    if trip.current_active_route is not None:
        previous_duration = trip.estimated_arrival
        if previous_duration:
            # Calculate the old duration from the trip's original ETA
            old_duration_min = None
            # Check the last reroute log for previous ETA
            last_log_stmt = (
                select(RerouteLog)
                .where(RerouteLog.trip_id == trip.trip_id)
                .order_by(RerouteLog.created_at.desc())
                .limit(1)
            )
            last_log = (await db.execute(last_log_stmt)).scalar_one_or_none()

            if last_log and last_log.new_eta:
                # Duration from last reroute
                old_duration_min = (last_log.new_eta - now).total_seconds() / 60
            else:
                old_duration_min = result["estimated_duration_min"] * 0.8  # fallback

            previous_duration = abs(old_duration_min) if old_duration_min else None

        status_str = "REROUTED_SUCCESSFULLY"
        delay = result["estimated_duration_min"] - (previous_duration or result["estimated_duration_min"])

    # 9. Update trip record
    new_eta = now + timedelta(minutes=result["estimated_duration_min"])
    route_geojson_str = json.dumps(result["route_geojson"])

    trip.current_active_route = ST_GeomFromGeoJSON(route_geojson_str)
    if trip.original_route_geom is None:
        trip.original_route_geom = ST_GeomFromGeoJSON(route_geojson_str)

    old_eta = trip.estimated_arrival
    trip.estimated_arrival = new_eta

    if status_str == "REROUTED_SUCCESSFULLY":
        trip.status = TripStatus.REROUTED
        trip.last_rerouted_at = now

        # 10. Log the reroute event
        delay_min = int(delay) if delay else None
        log = RerouteLog(
            trip_id=trip.trip_id,
            trigger_reason="HAZARD_AVOIDANCE" if avoid_hazards else "MANUAL_RECALCULATION",
            old_eta=old_eta,
            new_eta=new_eta,
            delay_variance_minutes=delay_min,
        )
        db.add(log)
        
        # 10.5 Dispatch Reroute Alert
        from app.alert_dispatcher import alert_dispatcher
        import asyncio
        
        msg = f"Vehicle {trip.vehicle_id} rerouted. Delay: {delay_min} mins."
        if ai_reasoning:
            msg += f" AI Rationale: {ai_reasoning}"
            
        asyncio.create_task(alert_dispatcher.process_event({
            "event_type": "IMMEDIATE_REROUTE",
            "severity": "CRITICAL",
            "message": msg,
            "trip_id": str(trip.trip_id),
            "vehicle_id": str(trip.vehicle_id),
            "source": "routing_engine",
        }))

    await db.flush()

    # 11. Broadcast reroute alert via WebSocket
    vehicle = await db.get(Vehicle, trip.vehicle_id)
    vehicle_name = vehicle.name if vehicle else "Unknown"

    await manager.broadcast({
        "event": "reroute_alert",
        "data": {
            "trip_id": str(trip.trip_id),
            "vehicle_id": str(trip.vehicle_id),
            "vehicle_name": vehicle_name,
            "commodity_type": trip.commodity_type.value if trip.commodity_type else "GENERAL",
            "status": status_str,
            "new_distance_km": result["total_distance_km"],
            "new_duration_min": result["estimated_duration_min"],
            "delay_minutes": int(delay) if delay else 0,
            "avoided_hazards": result["bypassed_blocked_count"],
            "new_eta": new_eta.isoformat(),
            "route_geojson": result["route_geojson"],
            "timestamp": now.isoformat(),
        },
    })

    return RouteCalculateResponse(
        status=status_str,
        total_distance_km=result["total_distance_km"],
        estimated_duration_min=result["estimated_duration_min"],
        previous_duration_min=previous_duration,
        delay_minutes=delay,
        avoided_hazards_count=result["bypassed_blocked_count"],
        route_geojson=RouteGeoJSON(**result["route_geojson"]),
        turn_by_turn_instructions=[
            TurnByTurnStep(**step) for step in instructions
        ],
    )


# ── Endpoint 2: Fleet Status Feed ────────────────────────────────────────────


@router.get("/fleet-status", response_model=FleetStatusResponse)
async def get_fleet_status(db: AsyncSession = Depends(get_db)):
    """Return the status of all active fleet trips for the command center."""
    stmt = (
        select(VehicleTrip)
        .where(VehicleTrip.status.in_([
            TripStatus.IN_TRANSIT,
            TripStatus.REROUTED,
            TripStatus.PENDING,
        ]))
        .options(selectinload(VehicleTrip.vehicle))
    )
    trips = (await db.execute(stmt)).scalars().all()

    now = datetime.now(timezone.utc)
    trip_responses = []
    rerouted_count = 0
    emergency_count = 0

    for trip in trips:
        # Get route GeoJSON if available
        original_route = None
        current_route = None

        if trip.original_route_geom is not None:
            orig_json = (await db.execute(
                select(ST_AsGeoJSON(trip.original_route_geom))
            )).scalar()
            original_route = _geom_to_geojson(orig_json)

        if trip.current_active_route is not None:
            curr_json = (await db.execute(
                select(ST_AsGeoJSON(trip.current_active_route))
            )).scalar()
            current_route = _geom_to_geojson(curr_json)

        # Calculate delay
        delay_min = None
        if trip.status == TripStatus.REROUTED and trip.last_rerouted_at:
            # Get the latest reroute log
            log_stmt = (
                select(RerouteLog.delay_variance_minutes)
                .where(RerouteLog.trip_id == trip.trip_id)
                .order_by(RerouteLog.created_at.desc())
                .limit(1)
            )
            log_delay = (await db.execute(log_stmt)).scalar()
            delay_min = log_delay

        if trip.status == TripStatus.REROUTED:
            rerouted_count += 1
        if trip.priority_level and trip.priority_level.value == "EMERGENCY":
            emergency_count += 1

        commodity = trip.commodity_type.value if trip.commodity_type else "GENERAL"
        priority = trip.priority_level.value if trip.priority_level else "STANDARD"
        status = trip.status.value if trip.status else "IN_TRANSIT"

        # Extract origin / destination coordinates from PostGIS points.
        # These are used by the frontend to call OSRM for real road-snapped
        # geometry, since stored route geometries may be straight-line placeholders.
        origin_lat = origin_lng = dest_lat = dest_lng = None
        if trip.origin_coords is not None:
            origin_geojson_str = (await db.execute(
                select(ST_AsGeoJSON(trip.origin_coords))
            )).scalar()
            if origin_geojson_str:
                origin_geom = json.loads(origin_geojson_str)
                coords = origin_geom.get("coordinates", [])
                if len(coords) >= 2:
                    origin_lng, origin_lat = coords[0], coords[1]

        if trip.dest_coords is not None:
            dest_geojson_str = (await db.execute(
                select(ST_AsGeoJSON(trip.dest_coords))
            )).scalar()
            if dest_geojson_str:
                dest_geom = json.loads(dest_geojson_str)
                coords = dest_geom.get("coordinates", [])
                if len(coords) >= 2:
                    dest_lng, dest_lat = coords[0], coords[1]

        trip_responses.append(FleetTripResponse(
            trip_id=trip.trip_id,
            vehicle_id=trip.vehicle_id,
            vehicle_name=trip.vehicle.name if trip.vehicle else "Unknown",
            license_plate=trip.vehicle.license_plate if trip.vehicle else None,
            organization=trip.vehicle.organization if trip.vehicle else None,
            origin_name=trip.origin_name,
            dest_name=trip.dest_name,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            commodity_type=commodity,
            priority_level=priority,
            status=status,
            estimated_arrival=trip.estimated_arrival,
            last_rerouted_at=trip.last_rerouted_at,
            delay_minutes=delay_min,
            original_route=original_route,
            current_route=current_route,
        ))

    return FleetStatusResponse(
        active_trips=trip_responses,
        total_active=len(trip_responses),
        rerouted_count=rerouted_count,
        emergency_count=emergency_count,
    )


# ── Endpoint 3: LLM Status Explanation (Mocked for Hackathon) ─────────────────

@router.get("/fleet-status/{trip_id}/explanation")
async def get_fleet_status_explanation(trip_id: str):
    """
    Mock LLM endpoint that converts raw telemetry/routing JSON into a human-readable explanation.
    In production, this would pass the trip's data and current hazards to OpenAI/Gemini.
    """
    import asyncio
    # Simulate LLM latency
    await asyncio.sleep(1.5)
    
    explanation = (
        f"AI Analysis for Trip {trip_id}:\n\n"
        "This shipment is currently navigating around a high-risk zone (Landslide/Flood reported recently). "
        "The dynamic routing engine has successfully bypassed the affected road segments. "
        "The driver has been alerted and is proceeding on a safe detour. "
        "Estimated delay is within acceptable margins, and no critical shortages are anticipated upon arrival."
    )
    
    return {"trip_id": trip_id, "explanation": explanation}


# ── Endpoint 4: AI Dynamic Route Alternatives (Groq Integration) ──────────────

@router.get("/trip/{trip_id}/alternatives")
async def get_trip_alternatives(trip_id: str, db: AsyncSession = Depends(get_db)):
    """
    Uses the Groq API (Qwen model) to generate dynamic, realistic route 
    alternatives based on the trip's origin, destination, and current conditions.
    """
    from app.services.llm_routing import generate_alternative_routes
    
    # Fetch trip details
    stmt = select(VehicleTrip).where(VehicleTrip.trip_id == trip_id)
    trip = (await db.execute(stmt)).scalar_one_or_none()
    
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
        
    origin = trip.origin_name or "Unknown Origin"
    dest = trip.dest_name or "Unknown Destination"
    commodity = trip.commodity_type.value if trip.commodity_type else "General Supplies"
    
    # For now, hardcode the blockage reason based on the dashboard context,
    # or infer it from the status.
    blockage_reason = "a severe landslide blocking the primary highway"
    
    alternatives = await generate_alternative_routes(
        origin_name=origin,
        dest_name=dest,
        commodity=commodity,
        blockage_reason=blockage_reason
    )
    
    return {"trip_id": trip_id, "alternatives": alternatives}
