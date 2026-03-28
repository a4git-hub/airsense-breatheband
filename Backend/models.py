from sqlalchemy import Column, Integer, Float, String, DateTime
from datetime import datetime
from database import Base

# ==========================================
# CONCEPT: The "Model"
# This Python class represents a generic "Row" in our Excel-like database table.
# SQLAlchemy will take this and magically create the actual table for us.
# ==========================================
class SensorReading(Base):
    # 'tablename' is the actual name of the sheet in the database
    __tablename__ = "readings"

    # Every row needs a unique ID (Primary Key) so we can find it
    id = Column(Integer, primary_key=True, index=True)
    
    # These match the data we want to store
    temperature = Column(Float)
    humidity = Column(Float)
    pressure = Column(Float)
    gas_resistance = Column(Float)
    pm25 = Column(Float)       # PM2.5 (ug/m3)
    pm1_0 = Column(Float)      # PM1.0 (ug/m3)
    pm10 = Column(Float)       # PM10  (ug/m3)
    altitude = Column(Float)   # Approximate altitude from sea level (m)
    
    # We add a timestamp so we know when the data came in
    # default=datetime.utcnow means "if we don't say when, use NOW"
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Optional: A nice way to print this object for debugging
    def __repr__(self):
        return f"<Reading(id={self.id}, temp={self.temperature}, pm25={self.pm25})>"

# ==========================================
# CONCEPT: Health Log Model
# This table stores the user's daily symptom entries.
# ==========================================
class SymptomEntry(Base):
    __tablename__ = "symptoms"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String)     # e.g. "2023-10-27"
    symptoms = Column(String) # We'll store this as a comma-separated string e.g. "cough,headache"
    notes = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

# ==========================================
# CONCEPT: User Account Model
# Stores user credentials and profile info.
# NEVER store passwords as plain text!
# ==========================================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    city = Column(String)
    full_name = Column(String)
    age = Column(Integer)
