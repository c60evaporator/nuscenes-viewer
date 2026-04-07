import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Get database URL from environment variable
DATABASE_URL = os.environ.get('DATABASE_URL')
print(f"SQLALCHEMY_DATABASE_URL: {DATABASE_URL}")
# Parse the database URL to get the database name, username, password, host, and port
DB_NAME = DATABASE_URL.split('/')[-1]
POSTGRES_USER = DATABASE_URL.split('//')[1].split(':')[0]
POSTGRES_PASSWORD = DATABASE_URL.split('//')[1].split(':')[1].split('@')[0]
DB_HOST = DATABASE_URL.split('@')[1].split(':')[0]
DB_PORT = DATABASE_URL.split(':')[-1].split('/')[0]

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Create DB Session instance
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# Create base class for declarative models
Base = declarative_base()
