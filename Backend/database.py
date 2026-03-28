from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ==========================================
# CONCEPT: The Database "Engine"
# This is the starting point. It's like the ignition key for the car.
# It knows *where* the database file is (airsense.db).
# ==========================================
SQLALCHEMY_DATABASE_URL = "sqlite:///./airsense.db"

# connect_args={"check_same_thread": False} is needed only for SQLite.
# It allows multiple parts of the web server to talk to the file at once.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# ==========================================
# CONCEPT: The "Session"
# A Session is a temporary workspace.
# key point: You open a session, do some work (save/read data), and then close it.
# We create a "SessionLocal" class that we can use to make these sessions later.
# ==========================================
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ==========================================
# CONCEPT: The "Base" Model
# This is a template. All our data tables (like "SensorReadings") 
# will inherit from this class so the database knows about them.
# ==========================================
Base = declarative_base()
