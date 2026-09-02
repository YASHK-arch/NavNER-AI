import asyncio
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    engine = create_async_engine('postgresql+psycopg://navner:navner_secret@localhost:5432/navner_ai')
    async with engine.begin() as conn:
        res = await conn.execute(sa.text("SELECT district, primary_contributing_factor FROM spatial_grid_cells c JOIN segment_risk_assessments r ON c.h3_index=r.h3_index WHERE district='Majuli'"))
        print("MAJULI IN DB:", res.fetchall())
    await engine.dispose()

asyncio.run(main())
