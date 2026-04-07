import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

from app.models import Base  # Import SQLAlchemy models

config = context.config

# Get DATABASE_URL
# asyncpg → psycopg2 (Alembic uses psycopg2)
db_url = os.environ["DATABASE_URL"].replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
config.set_main_option("sqlalchemy.url", db_url)

fileConfig(config.config_file_name)

target_metadata = Base.metadata  # Automatically detect schema from models

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Exclude PostGIS spatial indexes from diffs
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()

run_migrations_online()
