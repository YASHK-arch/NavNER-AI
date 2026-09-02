import asyncio
import sqlalchemy as sa
from app.database import engine
from app.models import Base
from app.seed import seed_demo_data
from sqlalchemy.ext.asyncio import AsyncSession

async def reseed():
    print("Seeding govt fleet data...")
    from app.services.govt_fleet_seed import seed_government_fleet
    from app.config import settings
    from sqlalchemy.ext.asyncio import create_async_engine
    govt_engine = create_async_engine(settings.GOVT_DATABASE_URL, echo=False, future=True)
    
    print("Dropping tables...")
    async with engine.begin() as conn:
        print("Truncating navner tables...")
        await conn.execute(sa.text("TRUNCATE TABLE users, vehicles, vehicle_trips, incidents, spatial_grid_cells, segment_risk_assessments, weather_telemetry, reroute_logs CASCADE"))
        
    async with govt_engine.begin() as govt_conn:
        print("Truncating govt tables...")
        await govt_conn.execute(sa.text("TRUNCATE TABLE fleet_vehicles CASCADE"))

    print("Seeding demo data...")
    async with AsyncSession(engine) as session:
        await seed_demo_data(session)
        await session.commit()
    async with AsyncSession(govt_engine) as govt_session, AsyncSession(engine) as navner_session:
        await seed_government_fleet(navner_session, govt_session)
        await govt_session.commit()
        await navner_session.commit()
    await engine.dispose()
    await govt_engine.dispose()
    print("Reseed complete!")

if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(reseed())
