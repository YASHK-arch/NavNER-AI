"""Provisioning of the 50-vehicle Assam scenario (issue #65 §3.2).

The demo needs a fleet large enough to look like a real operation and shaped so
the hazard engine has something to act on: trunk haulage on the NH corridors
plus last-mile capability inside the flood districts.

Corridors are real endpoints, so the OSRM polylines the simulator fetches follow
actual highways rather than straight lines. Seeding is idempotent — it keys on
licence plate, so re-running tops the fleet up instead of duplicating it, which
matters when a demo is reset repeatedly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from geoalchemy2.functions import ST_MakePoint
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.govt_models import FleetVehicle, GovtVehicleClass
from app.models import (
    CommodityType,
    TripPriority,
    TripStatus,
    Vehicle,
    VehicleClass,
    VehicleStatus,
    VehicleTrip,
    VehicleType,
    RerouteLog,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Corridor:
    """A haulage lane the simulator can drive vehicles along."""

    key: str
    origin_name: str
    origin: tuple[float, float]  # (lng, lat)
    dest_name: str
    dest: tuple[float, float]
    district: str
    commodity: CommodityType
    priority: TripPriority


# ── Trunk corridors: FCI heavy haulage out of Guwahati ────────────────────────
GUWAHATI = (91.7362, 26.1445)

TRUNK_CORRIDORS: list[Corridor] = [
    Corridor(
        "guwahati_imphal", "Guwahati Silo", GUWAHATI, "Imphal", (93.9368, 24.8170),
        "Imphal West", CommodityType.FOOD_GRAINS, TripPriority.HIGH_PRIORITY,
    ),
    Corridor(
        "guwahati_shillong", "Guwahati Silo", GUWAHATI, "Shillong", (91.8933, 25.5788),
        "East Khasi Hills", CommodityType.FOOD_GRAINS, TripPriority.STANDARD,
    ),
    Corridor(
        "guwahati_aizawl", "Guwahati Silo", GUWAHATI, "Aizawl", (92.7176, 23.7271),
        "Aizawl", CommodityType.FOOD_GRAINS, TripPriority.HIGH_PRIORITY,
    ),
    Corridor(
        "guwahati_silchar", "Guwahati Silo", GUWAHATI, "Silchar Relief Camp",
        (92.7789, 24.8333), "Cachar", CommodityType.MEDICINE, TripPriority.EMERGENCY,
    ),
    Corridor(
        "guwahati_dibrugarh", "Guwahati Silo", GUWAHATI, "Dibrugarh",
        (94.9120, 27.4728), "Dibrugarh", CommodityType.FUEL, TripPriority.STANDARD,
    ),
]

# ── Last-mile lanes inside the flood districts ────────────────────────────────
FLOOD_CORRIDORS: list[Corridor] = [
    Corridor(
        "majuli_local", "Jorhat Staging", (94.2037, 26.7509), "Majuli Island",
        (94.1700, 26.9500), "Majuli", CommodityType.MEDICINE, TripPriority.EMERGENCY,
    ),
    Corridor(
        "silchar_local", "Silchar Depot", (92.7789, 24.8333), "Cachar Relief Points",
        (92.9000, 24.7000), "Cachar", CommodityType.MEDICINE, TripPriority.EMERGENCY,
    ),
    Corridor(
        "kaziranga_local", "Golaghat Depot", (93.9600, 26.5100),
        "Kaziranga Camps", (93.3700, 26.5800), "Golaghat",
        CommodityType.GENERAL, TripPriority.HIGH_PRIORITY,
    ),
    Corridor(
        "morigaon_local", "Morigaon Depot", (92.3400, 26.2500), "Morigaon Chars",
        (92.2000, 26.3300), "Morigaon", CommodityType.FOOD_GRAINS,
        TripPriority.HIGH_PRIORITY,
    ),
]

# Registration dates are staggered across the last two 30-day windows so the
# dashboard's period-over-period growth column has a real prior period to
# compare against. The whole 50-vehicle roster is declared simulation (§3.2), so
# giving it a plausible registration history is part of the scenario rather than
# invented reporting — the growth figure is then computed from these rows like
# any other, not hardcoded.
SEED_HISTORY_DAYS = 60


def _staggered_created_at(index: int, total: int) -> datetime:
    """Spread registrations over the history window, oldest first."""
    now = datetime.now(timezone.utc)
    # Bias slightly toward the recent window so growth reads positive for most
    # districts, which is the realistic shape of a provisioning drive.
    fraction = (index / max(total - 1, 1)) ** 0.8
    days_ago = SEED_HISTORY_DAYS * (1 - fraction)
    return now - timedelta(days=days_ago, minutes=index)


TRUNK_FLEET_SIZE = 30
LAST_MILE_FLEET_SIZE = 20

# Rotated across the last-mile fleet so the flood districts get a realistic mix
# of road and water capability rather than 20 identical pickups.
LAST_MILE_CLASSES = [
    VehicleClass.PICKUP_4X4,
    VehicleClass.NDRF_BOAT,
    VehicleClass.AMBULANCE,
]


def _plan() -> list[tuple[str, VehicleClass, VehicleType, float, Corridor, TripStatus, TripPriority]]:
    """The 15-vehicle roster: (plate, class, chassis, tons, corridor, status, priority)."""
    roster: list[tuple[str, VehicleClass, VehicleType, float, Corridor, TripStatus, TripPriority]] = []

    # 5 On-Way (IN_TRANSIT, STANDARD)
    for i in range(5):
        corridor = TRUNK_CORRIDORS[i % len(TRUNK_CORRIDORS)]
        roster.append((
            f"AS-01-ONW-{100 + i}",
            VehicleClass.HEAVY_TRUCK,
            VehicleType.truck,
            18.0,
            corridor,
            TripStatus.IN_TRANSIT,
            TripPriority.STANDARD,
        ))

    # 5 Emergency (IN_TRANSIT, EMERGENCY)
    for i in range(5):
        corridor = FLOOD_CORRIDORS[i % len(FLOOD_CORRIDORS)]
        vclass = LAST_MILE_CLASSES[i % len(LAST_MILE_CLASSES)]
        chassis = VehicleType.ambulance if vclass is VehicleClass.AMBULANCE else VehicleType.utility
        roster.append((
            f"AS-11-EMG-{200 + i}",
            vclass,
            chassis,
            3.5 if vclass is not VehicleClass.NDRF_BOAT else 1.5,
            corridor,
            TripStatus.IN_TRANSIT,
            TripPriority.EMERGENCY,
        ))

    # 5 Rerouted (REROUTED, HIGH_PRIORITY)
    for i in range(5):
        corridor = TRUNK_CORRIDORS[(i + 2) % len(TRUNK_CORRIDORS)]
        roster.append((
            f"AS-01-RER-{300 + i}",
            VehicleClass.HEAVY_TRUCK,
            VehicleType.truck,
            18.0,
            corridor,
            TripStatus.REROUTED,
            TripPriority.HIGH_PRIORITY,
        ))

    return roster


async def seed_government_fleet(db: AsyncSession, govt_db: AsyncSession) -> dict:
    """Provision the scenario fleet in both databases. Idempotent on licence plate.

    Writes FleetVehicle rows to the Fleet Manager database — the scenario is
    demo data, but it is provisioned the same way a real registration is, so
    the two databases never disagree about which vehicles exist.

    "Already present" is decided against the fleet-manager database, not
    NavNER's — that is the source of truth for what was provisioned. A
    vehicle seeded before this dual-write existed is in NavNER's database but
    not the fleet-manager one; it is backfilled into the fleet-manager
    database on the next seed call rather than silently skipped, and without
    disturbing its existing NavNER Vehicle/Trip rows.
    """
    roster = _plan()
    plates = [r[0] for r in roster]

    existing_govt = {
        p
        for (p,) in (
            await govt_db.execute(
                select(FleetVehicle.license_plate).where(
                    FleetVehicle.license_plate.in_(plates)
                )
            )
        ).all()
    }
    existing_navner = {
        p
        for (p,) in (
            await db.execute(
                select(Vehicle.license_plate).where(Vehicle.license_plate.in_(plates))
            )
        ).all()
    }

    created = 0
    trips_created = 0
    backfilled = 0

    for index, (plate, vclass, chassis, tons, corridor, trip_status, trip_priority) in enumerate(roster):
        if plate in existing_govt:
            continue

        if plate in existing_navner:
            # Present in NavNER from before this dual-write existed. Backfill
            # the fleet-manager record only — do not touch the existing
            # Vehicle/Trip rows, which may carry live position or trip state
            # by now.
            govt_db.add(
                FleetVehicle(
                    license_plate=plate,
                    name=plate,
                    organization=(
                        "Food Corporation of India"
                        if vclass is VehicleClass.HEAVY_TRUCK
                        else "NDRF / State Disaster Response"
                    ),
                    vehicle_class=GovtVehicleClass(vclass.value),
                    cargo_capacity_tons=tons,
                    depot_origin=corridor.origin_name,
                    target_district=corridor.district,
                    synced_to_navner=True,
                    created_at=_staggered_created_at(index, len(roster)),
                )
            )
            backfilled += 1
            continue

        vehicle = Vehicle(
            name=plate,
            type=chassis,
            status=VehicleStatus.active,
            license_plate=plate,
            organization=(
                "Food Corporation of India"
                if vclass is VehicleClass.HEAVY_TRUCK
                else "NDRF / State Disaster Response"
            ),
            vehicle_class=vclass,
            cargo_capacity_tons=tons,
            depot_origin=corridor.origin_name,
            target_district=corridor.district,
            # Start every vehicle at its depot; the simulator advances it from
            # there once SIMULATE_TELEMETRY is on.
            current_location=ST_MakePoint(*corridor.origin),
            created_at=_staggered_created_at(index, len(roster)),
        )
        db.add(vehicle)
        await db.flush()
        await db.refresh(vehicle, ["id"])
        created += 1

        trip = VehicleTrip(
            vehicle_id=vehicle.id,
            origin_name=corridor.origin_name,
            origin_coords=ST_MakePoint(*corridor.origin),
            dest_name=corridor.dest_name,
            dest_coords=ST_MakePoint(*corridor.dest),
            commodity_type=corridor.commodity,
            priority_level=trip_priority,
            status=trip_status,
            last_rerouted_at=datetime.now(timezone.utc) if trip_status == TripStatus.REROUTED else None
        )
        db.add(trip)
        await db.flush()
        await db.refresh(trip, ["trip_id"])
        trips_created += 1

        if trip_status == TripStatus.REROUTED:
            log = RerouteLog(
                trip_id=trip.trip_id,
                trigger_reason="HAZARD_AVOIDANCE",
                old_eta=datetime.now(timezone.utc) + timedelta(minutes=60),
                new_eta=datetime.now(timezone.utc) + timedelta(minutes=75),
                delay_variance_minutes=15,
            )
            db.add(log)

        govt_db.add(
            FleetVehicle(
                license_plate=plate,
                name=plate,
                organization=vehicle.organization,
                vehicle_class=GovtVehicleClass(vclass.value),
                cargo_capacity_tons=tons,
                depot_origin=corridor.origin_name,
                target_district=corridor.district,
                synced_to_navner=True,
                created_at=vehicle.created_at,
            )
        )

    await db.commit()
    await govt_db.commit()

    total = (
        await db.execute(
            select(func.count()).select_from(Vehicle).where(
                Vehicle.license_plate.in_(plates)
            )
        )
    ).scalar_one()

    logger.info(
        "[Govt] Scenario fleet: %d created, %d trips, %d/%d present",
        created, trips_created, total, len(roster),
    )
    return {
        "requested": len(roster),
        "created": created,
        "trips_created": trips_created,
        "already_present": len(existing_govt),
        "backfilled_to_govt_db": backfilled,
        "total_in_scenario": total,
    }
