import asyncio
import selectors
from sqlalchemy import text
from app.database import async_session
from app.govt_database import govt_async_session

async def reset():
    print("Resetting vehicles...")
    async with async_session() as db:
        await db.execute(text("DELETE FROM telemetry;"))
        await db.execute(text("DELETE FROM reroute_logs;"))
        await db.execute(text("DELETE FROM vehicle_trips;"))
        await db.execute(text("DELETE FROM vehicles;"))
        await db.commit()

    async with govt_async_session() as db:
        await db.execute(text("DELETE FROM fleet_vehicles;"))
        await db.commit()
    print("Done.")

if __name__ == "__main__":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(reset())
