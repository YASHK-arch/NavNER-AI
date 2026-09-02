"""Service functions to trigger reroutes based on Stage 1 and Stage 2 events."""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.functions import ST_DWithin, ST_Intersects

from app.models import (
    Incident,
    RoadNetworkEdge,
    RoadStatus,
    VehicleTrip,
    TripStatus,
    SpatialGridCell,
)
from app.routers.routing import recalculate_trip_route

logger = logging.getLogger(__name__)

async def trigger_incident_reroute(incident: Incident, db: AsyncSession) -> None:
    """Finds nearest road edge to incident, marks it blocked, and recalculates intersecting trips."""
    # 1. Find the nearest RoadNetworkEdge (within ~2km = ~0.02 degrees)
    stmt = (
        select(RoadNetworkEdge)
        .where(ST_DWithin(RoadNetworkEdge.geom, incident.location, 0.02))
        .order_by(RoadNetworkEdge.geom.ST_Distance(incident.location))
        .limit(1)
    )
    edge = (await db.execute(stmt)).scalar_one_or_none()
    
    if not edge:
        logger.info("[Reroute Trigger] No road edge near incident %s. No reroute triggered.", incident.id)
        return
        
    # 2. Update edge status
    edge.current_status = RoadStatus.BLOCKED
    await db.flush()
    logger.info("[Reroute Trigger] Marked edge %s as BLOCKED due to incident.", edge.edge_id)
    
    # 3. Find trips that are IN_TRANSIT and intersect the blocked edge
    trip_stmt = (
        select(VehicleTrip)
        .where(VehicleTrip.status == TripStatus.IN_TRANSIT)
        .where(ST_Intersects(VehicleTrip.current_active_route, edge.geom))
    )
    affected_trips = (await db.execute(trip_stmt)).scalars().all()
    
    logger.info("[Reroute Trigger] Found %d active trips intersecting blocked edge.", len(affected_trips))
    
    # 4. Recalculate routes
    for trip in affected_trips:
        try:
            # 4a. Consult Groq for routing intelligence rationale
            from app.services.llm_routing import generate_alternative_routes
            commodity = trip.commodity_type.value if trip.commodity_type else "GENERAL"
            
            # Include incident description as part of the context for Groq
            blockage_reason = f"a {incident.type.value} incident"
            if incident.description:
                blockage_reason += f" (Context: {incident.description})"
                
            alts = await generate_alternative_routes(
                origin_name=trip.origin_name,
                dest_name=trip.dest_name,
                commodity=commodity,
                blockage_reason=blockage_reason
            )
            
            best_alt = alts[0] if alts else None
            ai_reasoning = f"{best_alt['label']}: {best_alt['description']}" if best_alt else None
            
            # 4b. Mathematically recalculate the spatial path and save the AI rationale
            await recalculate_trip_route(trip.trip_id, avoid_hazards=True, db=db, ai_reasoning=ai_reasoning)
            
            # 4c. Broadcast SMS dispatch simulation to frontend
            from app.websocket import manager
            await manager.broadcast({
                "event": "driver_sms_alert",
                "data": {
                    "trip_id": trip.trip_id,
                    "vehicle_id": trip.vehicle_id,
                    "phone": "+91-9755045490",
                    "message": f"NavNER ALERT: Route updated due to {incident.type.value}. AI Guidance: {best_alt['label'] if best_alt else 'Detour applied'}."
                }
            })
            logger.info("[SMS Gateway] Dispatched reroute SMS for trip %s to municipality user.", trip.trip_id)
        except Exception as e:
            logger.error("[Reroute Trigger] Failed to recalculate route for trip %s: %s", trip.trip_id, e)


async def trigger_hazard_reroute(critical_h3_indices: list[str], db: AsyncSession) -> None:
    """Finds trips traversing critical hazard zones and recalculates their routes."""
    if not critical_h3_indices:
        return
        
    # 1. Find trips intersecting any of the critical grid cells
    trip_stmt = (
        select(VehicleTrip)
        .join(SpatialGridCell, ST_Intersects(VehicleTrip.current_active_route, SpatialGridCell.geom))
        .where(SpatialGridCell.h3_index.in_(critical_h3_indices))
        .where(VehicleTrip.status == TripStatus.IN_TRANSIT)
        .distinct()
    )
    affected_trips = (await db.execute(trip_stmt)).scalars().all()
    
    logger.info("[Reroute Trigger] Found %d active trips traversing new critical hazard zones.", len(affected_trips))
    
    # 2. Recalculate routes
    for trip in affected_trips:
        try:
            await recalculate_trip_route(trip.trip_id, avoid_hazards=True, db=db)
        except Exception as e:
            logger.error("[Reroute Trigger] Failed to recalculate route for trip %s: %s", trip.trip_id, e)
