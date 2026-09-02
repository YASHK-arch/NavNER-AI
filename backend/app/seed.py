"""Seed the database with demo data for development."""

from datetime import datetime, timedelta, timezone

import h3
from geoalchemy2.functions import ST_GeomFromText, ST_MakePoint
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.risk_engine import classify_hazard
from app.models import (
    CommodityType,
    Incident,
    IncidentType,
    RiskLevel,
    RoadNetworkEdge,
    RoadStatus,
    SegmentRiskAssessment,
    SpatialGridCell,
    TripPriority,
    TripStatus,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
    VehicleTrip,
    VehicleType,
    WeatherTelemetryRecord,
)


def _h3_boundary_to_wkt(h3_index: str) -> str:
    """Convert an H3 index to a WKT POLYGON string."""
    boundary = h3.cell_to_boundary(h3_index)
    # h3 returns (lat, lng) pairs — WKT needs (lng, lat)
    coords = ", ".join(f"{lng} {lat}" for lat, lng in boundary)
    # Close the ring
    first = boundary[0]
    coords += f", {first[1]} {first[0]}"
    return f"POLYGON(({coords}))"


# Representative H3 cells across NER corridors (Resolution 7 ~ 1.22 km²)
NER_GRID_CELLS = [
    # Guwahati corridor (Assam)
    {"lat": 26.1445, "lng": 91.7362, "state": "Assam", "district": "Kamrup Metropolitan",
     "slope": 5.2, "elevation": 55, "susceptibility": 0.15},
    {"lat": 26.1800, "lng": 91.7800, "state": "Assam", "district": "Kamrup Metropolitan",
     "slope": 8.1, "elevation": 85, "susceptibility": 0.20},

    # Shillong corridor (Meghalaya)
    {"lat": 25.5788, "lng": 91.8933, "state": "Meghalaya", "district": "East Khasi Hills",
     "slope": 32.5, "elevation": 1496, "susceptibility": 0.72},
    {"lat": 25.6200, "lng": 91.8500, "state": "Meghalaya", "district": "East Khasi Hills",
     "slope": 38.0, "elevation": 1350, "susceptibility": 0.80},
    {"lat": 25.6751, "lng": 91.5860, "state": "Meghalaya", "district": "Ri-Bhoi",
     "slope": 28.5, "elevation": 900, "susceptibility": 0.65},

    # Imphal Valley (Manipur)
    {"lat": 24.8170, "lng": 93.9368, "state": "Manipur", "district": "Imphal West Landslide",
     "slope": 5.0, "elevation": 786, "susceptibility": 0.35, "resolution": 9},
    {"lat": 24.7500, "lng": 93.8800, "state": "Manipur", "district": "Bishnupur",
     "slope": 6.8, "elevation": 780, "susceptibility": 0.25},

    # Kamrup Metropolitan (Guwahati) - Simulated small landslide hex
    {"lat": 26.1445, "lng": 91.7362, "state": "Assam", "district": "Kamrup Metropolitan Landslide",
     "slope": 5.2, "elevation": 55, "susceptibility": 0.15, "resolution": 9},

    # Dibrugarh corridor (Assam)
    {"lat": 27.4728, "lng": 94.9120, "state": "Assam", "district": "Dibrugarh",
     "slope": 3.1, "elevation": 108, "susceptibility": 0.10},
    {"lat": 27.5000, "lng": 95.0000, "state": "Assam", "district": "Tinsukia",
     "slope": 4.5, "elevation": 116, "susceptibility": 0.12},

    # Tezpur corridor (Assam)
    {"lat": 26.7509, "lng": 92.7176, "state": "Assam", "district": "Sonitpur",
     "slope": 7.8, "elevation": 78, "susceptibility": 0.18},

    # Churachandpur (Manipur) — hilly terrain
    {"lat": 25.3653, "lng": 93.6907, "state": "Manipur", "district": "Churachandpur",
     "slope": 35.2, "elevation": 1150, "susceptibility": 0.70},

    # Aizawl corridor (Mizoram)
    {"lat": 23.7271, "lng": 92.7176, "state": "Mizoram", "district": "Aizawl",
     "slope": 40.0, "elevation": 1132, "susceptibility": 0.78},
    {"lat": 23.6800, "lng": 92.7500, "state": "Mizoram", "district": "Aizawl",
     "slope": 36.5, "elevation": 1050, "susceptibility": 0.73},

    # Kohima (Nagaland)
    {"lat": 25.6700, "lng": 94.1100, "state": "Nagaland", "district": "Kohima",
     "slope": 33.0, "elevation": 1261, "susceptibility": 0.68},

    # Gangtok corridor (Sikkim)
    {"lat": 27.3314, "lng": 88.6138, "state": "Sikkim", "district": "East Sikkim",
     "slope": 42.0, "elevation": 1650, "susceptibility": 0.82},
    {"lat": 27.2800, "lng": 88.5800, "state": "Sikkim", "district": "East Sikkim",
     "slope": 38.5, "elevation": 1480, "susceptibility": 0.76},

    # Agartala (Tripura) — relatively flat
    {"lat": 23.8315, "lng": 91.2868, "state": "Tripura", "district": "West Tripura",
     "slope": 4.2, "elevation": 13, "susceptibility": 0.08},

    # Silchar (Assam — Barak Valley)
    {"lat": 24.8333, "lng": 92.7789, "state": "Assam", "district": "Cachar",
     "slope": 9.5, "elevation": 35, "susceptibility": 0.22},

    # NH-6 corridor (Meghalaya)
    {"lat": 25.5000, "lng": 91.7000, "state": "Meghalaya", "district": "East Khasi Hills",
     "slope": 34.0, "elevation": 1280, "susceptibility": 0.75},
    {"lat": 25.4500, "lng": 91.6500, "state": "Meghalaya", "district": "East Khasi Hills",
     "slope": 30.0, "elevation": 1100, "susceptibility": 0.68},

    # Majuli simulated fake flood block
    {"lat": 26.89999, "lng": 94.16430, "state": "Assam", "district": "Majuli",
     "slope": 1.0, "elevation": 80, "susceptibility": 0.95},
]

# Initial risk assessments (varying levels for demo).
# Only the curated model *inputs* live here — composite_risk_level and
# predicted_blockage_probability are derived via risk_engine.classify_hazard so
# the seeded dashboard state always matches what the engine itself would produce.
# Previously these levels were hardcoded string literals that the engine's own
# formula contradicted (Aizawl's 0.88/0.32 was labelled CRITICAL but classified
# HIGH), so the first evaluation silently rewrote the map.
INITIAL_RISK_DATA = {
    # (landslide_score, flood_score, factor)
    "Kamrup Metropolitan": (0.55, 0.25, "Soil inconsistencies and possible disruptions"),
    "Kamrup Metropolitan Landslide": (0.95, 0.25, "Major landslide simulation blocking main route"),
    "East Khasi Hills": (0.78, 0.35, "Heavy precipitation on steep slope (35°)"),
    "Ri-Bhoi": (0.62, 0.30, "Elevated landslide conditions (slope 28°, rain 80mm)"),
    "Imphal West": (0.55, 0.22, "Soil inconsistencies and possible disruptions"),
    "Imphal West Landslide": (0.95, 0.22, "Major landslide simulation blocking main route"),
    "Bishnupur": (0.20, 0.18, "Normal conditions — low terrain risk"),
    "Dibrugarh": (0.08, 0.45, "Waterlogging risk (rainfall 25mm/hr, low drainage)"),
    "Tinsukia": (0.10, 0.40, "Waterlogging risk (rainfall 20mm/hr, low drainage)"),
    "Sonitpur": (0.15, 0.38, "Waterlogging risk — Brahmaputra proximity"),
    "Churachandpur": (0.72, 0.28, "Prolonged rainfall (150mm/24h) on unstable terrain"),
    "Aizawl": (0.88, 0.32, "Heavy precipitation on steep slope (40°)"),
    "Kohima": (0.70, 0.30, "Heavy precipitation on steep slope (33°)"),
    "East Sikkim": (0.92, 0.28, "Heavy precipitation on steep slope (42°)"),
    "West Tripura": (0.06, 0.15, "Normal conditions — flat terrain"),
    "Cachar": (0.18, 0.52, "Sustained flooding — Barak Valley low elevation"),
    "Majuli": (0.10, 0.98, "Total blockade simulated by fake flood alert"),
}


# ── Stage 3: Road Network Graph Data ──────────────────────────────────────────

# Key NER road network nodes (cities/towns/junctions)
NER_ROAD_NODES: dict[int, dict] = {
    1:  {"name": "Guwahati Hub",       "lat": 26.1445, "lng": 91.7362},
    2:  {"name": "Nongpoh",            "lat": 25.8920, "lng": 91.8770},
    3:  {"name": "Shillong",           "lat": 25.5788, "lng": 91.8933},
    4:  {"name": "Tezpur",             "lat": 26.6338, "lng": 92.8000},
    5:  {"name": "Nagaon",             "lat": 26.3500, "lng": 92.6900},
    6:  {"name": "Dibrugarh",          "lat": 27.4728, "lng": 94.9120},
    7:  {"name": "Jorhat",             "lat": 26.7509, "lng": 94.2037},
    8:  {"name": "Imphal",             "lat": 24.8170, "lng": 93.9368},
    9:  {"name": "Kohima",             "lat": 25.6700, "lng": 94.1100},
    10: {"name": "Dimapur",            "lat": 25.9042, "lng": 93.7271},
    11: {"name": "Silchar",            "lat": 24.8333, "lng": 92.7789},
    12: {"name": "Aizawl",             "lat": 23.7271, "lng": 92.7176},
    13: {"name": "Agartala",           "lat": 23.8315, "lng": 91.2868},
    14: {"name": "Gangtok",            "lat": 27.3314, "lng": 88.6138},
    15: {"name": "Siliguri",           "lat": 26.7271, "lng": 88.3953},
    16: {"name": "Churachandpur",      "lat": 24.3330, "lng": 93.6830},
    17: {"name": "Lumding Junction",   "lat": 25.7500, "lng": 93.1700},
    18: {"name": "Haflong",            "lat": 25.1650, "lng": 93.0170},
    19: {"name": "Tinsukia",           "lat": 27.4890, "lng": 95.3560},
    20: {"name": "Numaligarh",         "lat": 26.6200, "lng": 93.7200},
    21: {"name": "Mokokchung",         "lat": 26.3220, "lng": 94.5180},
    22: {"name": "Nongstoin",          "lat": 25.5200, "lng": 91.2650},
    23: {"name": "Tura",               "lat": 25.5150, "lng": 90.2170},
    24: {"name": "Umiam (Barapani)",   "lat": 25.6751, "lng": 91.5860},
}

# Directed road network edges (bidirectional added as two edges)
# Each tuple: (source, target, road_name, road_class, length_km, base_speed_kmh, hazard_penalty)
# Coordinates are simplified [lng, lat] waypoints for LineString geometry
NER_ROAD_EDGES = [
    # Guwahati → Nongpoh → Shillong (NH6)
    (1, 24, "NH6", "NH", 50.0, 45.0, 0.0,
     [[91.7362, 26.1445], [91.72, 25.95], [91.5860, 25.6751]]),
    (24, 3, "NH6", "NH", 30.0, 35.0, 0.65,
     [[91.5860, 25.6751], [91.75, 25.62], [91.8933, 25.5788]]),
    # Alternate Guwahati → Nongpoh → Shillong via bypass
    (1, 2, "NH6-Bypass", "SH", 55.0, 40.0, 0.0,
     [[91.7362, 26.1445], [91.80, 26.00], [91.8770, 25.8920]]),
    (2, 3, "SH-5", "SH", 45.0, 35.0, 0.20,
     [[91.8770, 25.8920], [91.88, 25.72], [91.8933, 25.5788]]),

    # Guwahati → Nagaon (NH27)
    (1, 5, "NH27", "NH", 120.0, 55.0, 0.0,
     [[91.7362, 26.1445], [92.10, 26.22], [92.6900, 26.3500]]),

    # Nagaon → Tezpur
    (5, 4, "NH15", "NH", 90.0, 50.0, 0.15,
     [[92.6900, 26.3500], [92.75, 26.50], [92.8000, 26.6338]]),

    # Nagaon → Lumding Junction
    (5, 17, "NH36", "NH", 75.0, 45.0, 0.10,
     [[92.6900, 26.3500], [92.85, 25.95], [93.1700, 25.7500]]),

    # Lumding → Dimapur
    (17, 10, "NH29", "NH", 85.0, 45.0, 0.20,
     [[93.1700, 25.7500], [93.40, 25.80], [93.7271, 25.9042]]),

    # Lumding → Haflong → Silchar
    (17, 18, "NH54", "NH", 80.0, 35.0, 0.35,
     [[93.1700, 25.7500], [93.10, 25.45], [93.0170, 25.1650]]),
    (18, 11, "NH54", "NH", 95.0, 35.0, 0.30,
     [[93.0170, 25.1650], [92.90, 25.00], [92.7789, 24.8333]]),

    # Nagaon → Numaligarh → Jorhat
    (5, 20, "NH37", "NH", 85.0, 50.0, 0.05,
     [[92.6900, 26.3500], [93.20, 26.50], [93.7200, 26.6200]]),
    (20, 7, "NH37", "NH", 55.0, 50.0, 0.05,
     [[93.7200, 26.6200], [94.00, 26.70], [94.2037, 26.7509]]),

    # Jorhat → Dibrugarh → Tinsukia
    (7, 6, "NH37", "NH", 130.0, 50.0, 0.08,
     [[94.2037, 26.7509], [94.50, 27.00], [94.9120, 27.4728]]),
    (6, 19, "NH37", "NH", 50.0, 50.0, 0.05,
     [[94.9120, 27.4728], [95.10, 27.48], [95.3560, 27.4890]]),

    # Dimapur → Kohima → Imphal
    (10, 9, "NH29", "NH", 74.0, 30.0, 0.55,
     [[93.7271, 25.9042], [93.90, 25.80], [94.1100, 25.6700]]),
    (9, 8, "NH2", "NH", 135.0, 35.0, 0.40,
     [[94.1100, 25.6700], [94.05, 25.20], [93.9368, 24.8170]]),

    # Dimapur → Mokokchung (alternate north Nagaland route)
    (10, 21, "NH61", "SH", 130.0, 30.0, 0.50,
     [[93.7271, 25.9042], [94.10, 26.10], [94.5180, 26.3220]]),

    # Imphal → Churachandpur
    (8, 16, "NH2", "SH", 62.0, 30.0, 0.60,
     [[93.9368, 24.8170], [93.80, 24.55], [93.6830, 24.3330]]),

    # Silchar → Aizawl
    (11, 12, "NH54", "NH", 170.0, 30.0, 0.70,
     [[92.7789, 24.8333], [92.75, 24.30], [92.7176, 23.7271]]),

    # Silchar → Agartala
    (11, 13, "NH8", "NH", 310.0, 40.0, 0.15,
     [[92.7789, 24.8333], [92.00, 24.20], [91.2868, 23.8315]]),

    # Guwahati → Nongstoin → Tura (western Meghalaya)
    (1, 22, "NH6W", "SH", 110.0, 35.0, 0.35,
     [[91.7362, 26.1445], [91.50, 25.80], [91.2650, 25.5200]]),
    (22, 23, "NH62", "NH", 130.0, 35.0, 0.25,
     [[91.2650, 25.5200], [90.70, 25.50], [90.2170, 25.5150]]),

    # Siliguri → Gangtok
    (15, 14, "NH10", "NH", 124.0, 30.0, 0.75,
     [[88.3953, 26.7271], [88.50, 27.00], [88.6138, 27.3314]]),

    # Guwahati → Shillong alternate (via east bypass)
    (1, 3, "NH40-Alt", "SH", 105.0, 40.0, 0.10,
     [[91.7362, 26.1445], [91.85, 25.85], [91.8933, 25.5788]]),

    # Tezpur → Numaligarh (cross-river connection)
    (4, 20, "NH15X", "SH", 60.0, 40.0, 0.10,
     [[92.8000, 26.6338], [93.25, 26.63], [93.7200, 26.6200]]),
]


def _build_linestring_wkt(coords: list[list[float]]) -> str:
    """Build a WKT LINESTRING from a list of [lng, lat] coordinate pairs."""
    points = ", ".join(f"{c[0]} {c[1]}" for c in coords)
    return f"LINESTRING({points})"


def _build_route_wkt(node_ids: list[int]) -> str:
    """Build a WKT LINESTRING from a sequence of node IDs."""
    coords = []
    for nid in node_ids:
        node = NER_ROAD_NODES.get(nid)
        if node:
            coords.append(f"{node['lng']} {node['lat']}")
    return f"LINESTRING({', '.join(coords)})"


async def seed_demo_data(db: AsyncSession) -> None:
    """Insert demo users, vehicles, and incidents if the database is empty."""

    # Skip if data already exists
    existing = (await db.execute(select(User.id).limit(1))).first()
    if existing:
        return

    # ── Users ──────────────────────────────────────────────────────────────
    admin = User(
        name="Rajesh Kumar",
        role=UserRole.admin,
        district="Kamrup Metropolitan",
        auth_token="demo-admin-token",
    )
    field_officer_1 = User(
        name="Anita Devi",
        role=UserRole.field_official,
        district="East Khasi Hills",
        auth_token="demo-field-token-1",
    )
    field_officer_2 = User(
        name="Biren Singh",
        role=UserRole.field_official,
        district="Imphal West",
        auth_token="demo-field-token-2",
    )
    db.add_all([admin, field_officer_1, field_officer_2])
    await db.flush()

    # ── Vehicles ───────────────────────────────────────────────────────────
    # Positioned across key NER locations
    vehicles = [
        Vehicle(
            name="NER-TRUCK-001",
            type=VehicleType.truck,
            status=VehicleStatus.active,
            license_plate="AS-01-X-1234",
            organization="Food Corporation of India",
            current_location=ST_MakePoint(91.7362, 26.1445),  # Guwahati
            last_ping=datetime.now(timezone.utc),
        ),
        Vehicle(
            name="NER-TRUCK-002",
            type=VehicleType.truck,
            status=VehicleStatus.active,
            license_plate="ML-05-Y-5678",
            organization="Indian Oil Corp",
            current_location=ST_MakePoint(91.8933, 25.5788),  # Shillong
            last_ping=datetime.now(timezone.utc),
        ),
        Vehicle(
            name="NER-AMB-001",
            type=VehicleType.ambulance,
            status=VehicleStatus.active,
            license_plate="MN-01-A-9999",
            organization="NHM Medical Logistics",
            current_location=ST_MakePoint(93.9368, 24.8170),  # Imphal
            last_ping=datetime.now(timezone.utc),
        ),
        Vehicle(
            name="NER-UTIL-001",
            type=VehicleType.utility,
            status=VehicleStatus.active,
            license_plate="AS-06-Z-1111",
            organization="FEMA Logistics",
            current_location=ST_MakePoint(94.9120, 27.4728),  # Dibrugarh
            last_ping=datetime.now(timezone.utc),
        ),
        Vehicle(
            name="NER-TRUCK-003",
            type=VehicleType.truck,
            status=VehicleStatus.inactive,
            license_plate="AS-12-B-2222",
            organization="State Supply Chain",
            current_location=ST_MakePoint(92.7176, 26.7509),  # Tezpur
            last_ping=datetime.now(timezone.utc),
        ),
    ]
    db.add_all(vehicles)
    await db.flush()

    # ── Incidents ──────────────────────────────────────────────────────────
    incidents = [
        Incident(
            type=IncidentType.landslide,
            location=ST_MakePoint(91.5860, 25.6751),  # Near Shillong
            description="Major landslide blocking NH-6 near Umiam. "
            "Approximately 50m of road covered with debris. "
            "No casualties reported.",
            status="open",
            reported_by=field_officer_1.id,
            created_at=datetime.now(timezone.utc),
        ),
        Incident(
            type=IncidentType.flood,
            location=ST_MakePoint(92.8347, 26.7428),  # Near Tezpur
            description="Flash flood on Brahmaputra tributary. "
            "Road submerged under 2ft of water near Tezpur bypass. "
            "Vehicles being diverted via alternate route.",
            status="open",
            reported_by=field_officer_2.id,
            created_at=datetime.now(timezone.utc),
        ),
        Incident(
            type=IncidentType.road_damage,
            location=ST_MakePoint(93.6907, 25.3653),  # Near Churachandpur
            description="Severe pothole damage on state highway. "
            "Heavy vehicle passage restricted. "
            "Repair crew dispatched.",
            status="in_progress",
            reported_by=field_officer_1.id,
            created_at=datetime.now(timezone.utc),
        ),
    ]
    db.add_all(incidents)
    await db.flush()

    # ── Stage 2: H3 Spatial Grid Cells ─────────────────────────────────────
    now = datetime.now(timezone.utc)

    for cell_info in NER_GRID_CELLS:
        # Get H3 index for this coordinate at dynamic resolution (default 7)
        res = cell_info.get("resolution", 7)
        h3_index = h3.latlng_to_cell(cell_info["lat"], cell_info["lng"], res)

        # Convert H3 boundary to WKT polygon
        wkt = _h3_boundary_to_wkt(h3_index)

        grid_cell = SpatialGridCell(
            h3_index=h3_index,
            geom=ST_GeomFromText(wkt, 4326),
            state=cell_info["state"],
            district=cell_info["district"],
            avg_slope_degrees=cell_info["slope"],
            elevation_meters=cell_info["elevation"],
            landslide_susceptibility_base=cell_info["susceptibility"],
        )
        db.add(grid_cell)
        await db.flush()

        # Add initial risk assessment
        risk_data = INITIAL_RISK_DATA.get(cell_info["district"])
        if risk_data:
            ls_score, fl_score, factor = risk_data
            classification = classify_hazard(ls_score, fl_score)
            risk_assessment = SegmentRiskAssessment(
                h3_index=h3_index,
                last_evaluated=now,
                landslide_risk_score=ls_score,
                flood_risk_score=fl_score,
                composite_risk_level=RiskLevel(classification["composite_risk_level"]),
                predicted_blockage_probability=classification["predicted_blockage_probability"],
                primary_contributing_factor=factor,
            )
            db.add(risk_assessment)

        # Add initial weather telemetry record
        weather_record = WeatherTelemetryRecord(
            h3_index=h3_index,
            timestamp=now,
            rainfall_1h_mm=cell_info["slope"] * 0.5 + 5,  # Synthetic initial data
            rainfall_24h_mm=cell_info["slope"] * 2.5 + 20,
            soil_saturation_pct=min(cell_info["susceptibility"] * 80 + 15, 100),
            temperature_c=25 - cell_info["elevation"] * 0.006,  # Lapse rate
            surface_runoff_rate=cell_info["slope"] * 0.02,
        )
        db.add(weather_record)

    await db.flush()

    # ── Stage 3: Road Network Edges ────────────────────────────────────────
    for edge_data in NER_ROAD_EDGES:
        src, tgt, road_name, road_class, length_km, base_speed, hazard, coords = edge_data
        base_duration = (length_km / base_speed) * 60  # minutes

        # Determine initial status based on hazard penalty
        status = RoadStatus.CLEAR
        if hazard >= 0.80:
            status = RoadStatus.BLOCKED
        elif hazard >= 0.50:
            status = RoadStatus.RESTRICTED

        wkt = _build_linestring_wkt(coords)

        edge = RoadNetworkEdge(
            source_node=src,
            target_node=tgt,
            road_name=road_name,
            road_class=road_class,
            length_km=length_km,
            base_speed_kmh=base_speed,
            base_duration_min=round(base_duration, 1),
            is_active=True,
            current_status=status,
            current_hazard_penalty=hazard,
            geom=ST_GeomFromText(wkt, 4326),
        )
        db.add(edge)

        # Add reverse edge (bidirectional roads) with same attributes
        reverse_coords = list(reversed(coords))
        reverse_wkt = _build_linestring_wkt(reverse_coords)

        reverse_edge = RoadNetworkEdge(
            source_node=tgt,
            target_node=src,
            road_name=road_name,
            road_class=road_class,
            length_km=length_km,
            base_speed_kmh=base_speed,
            base_duration_min=round(base_duration, 1),
            is_active=True,
            current_status=status,
            current_hazard_penalty=hazard,
            geom=ST_GeomFromText(reverse_wkt, 4326),
        )
        db.add(reverse_edge)

    await db.flush()

    # ── Stage 3: Demo Vehicle Trips ────────────────────────────────────────
    # Trip 1: Emergency medical supply — Guwahati → Imphal
    route_1_wkt = _build_route_wkt([1, 5, 17, 10, 9, 8])
    trip_1 = VehicleTrip(
        vehicle_id=vehicles[0].id,
        origin_name="Guwahati Hub",
        origin_coords=ST_MakePoint(91.7362, 26.1445),
        dest_name="Imphal",
        dest_coords=ST_MakePoint(93.9368, 24.8170),
        commodity_type=CommodityType.MEDICINE,
        priority_level=TripPriority.EMERGENCY,
        status=TripStatus.IN_TRANSIT,
        original_route_geom=ST_GeomFromText(route_1_wkt, 4326),
        current_active_route=ST_GeomFromText(route_1_wkt, 4326),
        estimated_arrival=now + timedelta(hours=12),
    )

    # Trip 2: Food grains — Dibrugarh → Silchar
    route_2_wkt = _build_route_wkt([6, 7, 20, 5, 17, 18, 11])
    trip_2 = VehicleTrip(
        vehicle_id=vehicles[3].id,
        origin_name="Dibrugarh",
        origin_coords=ST_MakePoint(94.9120, 27.4728),
        dest_name="Silchar",
        dest_coords=ST_MakePoint(92.7789, 24.8333),
        commodity_type=CommodityType.FOOD_GRAINS,
        priority_level=TripPriority.STANDARD,
        status=TripStatus.IN_TRANSIT,
        original_route_geom=ST_GeomFromText(route_2_wkt, 4326),
        current_active_route=ST_GeomFromText(route_2_wkt, 4326),
        estimated_arrival=now + timedelta(hours=18),
    )

    # Trip 3: Fuel supply — Guwahati → Shillong (via hazardous NH6)
    route_3_wkt = _build_route_wkt([1, 24, 3])
    trip_3 = VehicleTrip(
        vehicle_id=vehicles[1].id,
        origin_name="Guwahati Hub",
        origin_coords=ST_MakePoint(91.7362, 26.1445),
        dest_name="Shillong",
        dest_coords=ST_MakePoint(91.8933, 25.5788),
        commodity_type=CommodityType.FUEL,
        priority_level=TripPriority.HIGH_PRIORITY,
        status=TripStatus.IN_TRANSIT,
        original_route_geom=ST_GeomFromText(route_3_wkt, 4326),
        current_active_route=ST_GeomFromText(route_3_wkt, 4326),
        estimated_arrival=now + timedelta(hours=3),
    )

    # Trip 4: General supply — Imphal → Churachandpur (rerouted example)
    route_4_wkt = _build_route_wkt([8, 16])
    trip_4 = VehicleTrip(
        vehicle_id=vehicles[2].id,
        origin_name="Imphal",
        origin_coords=ST_MakePoint(93.9368, 24.8170),
        dest_name="Churachandpur",
        dest_coords=ST_MakePoint(93.6830, 24.3330),
        commodity_type=CommodityType.GENERAL,
        priority_level=TripPriority.STANDARD,
        status=TripStatus.REROUTED,
        original_route_geom=ST_GeomFromText(route_4_wkt, 4326),
        current_active_route=ST_GeomFromText(route_4_wkt, 4326),
        estimated_arrival=now + timedelta(hours=4),
        last_rerouted_at=now - timedelta(hours=1),
    )

    db.add_all([trip_1, trip_2, trip_3, trip_4])
    await db.flush()
    await db.commit()
    print("✅ Demo data seeded successfully (Stage 1 + Stage 2 + Stage 3 routing).")
