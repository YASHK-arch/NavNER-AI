import asyncio
from app.database import async_session
from app.routers.routing import get_trip_alternatives

async def main():
    async with async_session() as db:
        try:
            res = await get_trip_alternatives('AS-01-RER-304', db)
            print(res)
        except Exception as e:
            import traceback; traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
