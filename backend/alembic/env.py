import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.models import Base  # SQLAlchemyのモデルをインポート

config = context.config

# DATABASE_URL を環境変数から注入
# asyncpg → psycopg2 に変換（Alembic は同期接続を使う）
db_url = os.environ["DATABASE_URL"].replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
config.set_main_option("sqlalchemy.url", db_url)

fileConfig(config.config_file_name)

target_metadata = Base.metadata  # モデルからスキーマを自動検出

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
            # PostGIS の空間インデックスを差分から除外（重要）
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()

run_migrations_online()
