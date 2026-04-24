import argparse
import asyncio
import logging

from app.json_conversion.to_nusc_db import import_all

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

parser = argparse.ArgumentParser()
parser.add_argument("--dataset-version", default="v1.0-trainval")
args = parser.parse_args()

asyncio.run(import_all(
    data_root="/data/nuscenes",
    version=args.dataset_version,
))
