import asyncio
import logging

from app.json_conversion.to_map_db import import_all_maps

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

asyncio.run(import_all_maps(
    data_root="/data/nuscenes",
))
