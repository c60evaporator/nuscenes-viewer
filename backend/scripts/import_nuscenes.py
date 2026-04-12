from app.json_conversion.to_nusc_db import import_all
import asyncio

asyncio.run(import_all(
    data_root="/data/nuscenes",
    version="v1.0-mini"
))
