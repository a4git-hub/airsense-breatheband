from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import requests as http_requests
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from passlib.context import CryptContext

import models
import ble_client
from database import SessionLocal, engine

# ==========================================
# Database Setup
# ==========================================
models.Base.metadata.create_all(bind=engine)

# ==========================================
# FastAPI Lifespan — starts BLE background task
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start BLE client on server startup; cancel it on shutdown."""
    ble_task = asyncio.create_task(ble_client.run_ble_client())
    try:
        yield
    finally:
        ble_task.cancel()
        try:
            await ble_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="AirSense Backend", lifespan=lifespan)

# ==========================================
# CORS
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Password Hashing
# ==========================================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# ==========================================
# DB Session Dependency
# ==========================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================================
# Pydantic Models
# ==========================================
class SensorData(BaseModel):
    temperature: float
    humidity: float
    pressure: float
    gas_resistance: float
    pm25: Optional[float] = None
    pm1_0: Optional[float] = None
    pm10: Optional[float] = None
    altitude: Optional[float] = None
    timestamp: Optional[str] = None

class SymptomLog(BaseModel):
    date: str
    symptoms: List[str]
    notes: Optional[str] = ""

class UserRegister(BaseModel):
    email: str
    password: str
    full_name: str
    age: int

class UserLogin(BaseModel):
    email: str
    password: str

# ==========================================
# Sensor Data Endpoints
# ==========================================

@app.post("/api/data")
def receive_data_from_band(data: SensorData, db: Session = Depends(get_db)):
    """Receives sensor data and saves it to the SQLite database."""
    new_reading = models.SensorReading(
        temperature=data.temperature,
        humidity=data.humidity,
        pressure=data.pressure,
        gas_resistance=data.gas_resistance,
        pm25=data.pm25,
        pm1_0=data.pm1_0,
        pm10=data.pm10,
        altitude=data.altitude,
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)
    return {"status": "success", "id": new_reading.id}


@app.get("/api/data/live")
def get_live_data():
    """
    Returns the latest in-memory reading from the BLE client.
    Updated every ~5 seconds. No DB hit.
    """
    return ble_client.live_data


@app.get("/api/data/latest")
def get_latest_data(db: Session = Depends(get_db)):
    """Returns the most recent DB-persisted reading (written every 60s)."""
    latest = db.query(models.SensorReading).order_by(models.SensorReading.timestamp.desc()).first()
    if latest is None:
        return {}
    return latest


@app.get("/api/data/history")
def get_data_history(
    granularity: str = "daily",   # "daily" | "hourly"
    days: int = 10,               # used when granularity=daily
    date: Optional[str] = None,   # "YYYY-MM-DD", used when granularity=hourly
    db: Session = Depends(get_db)
):
    """
    Returns aggregated historical sensor data.

    granularity=daily  → last N days, one row per day with min/max/avg per sensor.
    granularity=hourly → all hourly averages for `date` (YYYY-MM-DD).
                         Falls back to 5-minute buckets if data is sparse (<3 points/hour).
    """
    if granularity == "daily":
        days = min(days, 30)
        cutoff = datetime.utcnow() - timedelta(days=days)

        rows = db.execute(text("""
            SELECT
                DATE(timestamp, 'localtime') AS day,
                ROUND(MIN(temperature), 2)  AS temperature_min,
                ROUND(MAX(temperature), 2)  AS temperature_max,
                ROUND(AVG(temperature), 2)  AS temperature_avg,
                ROUND(MIN(humidity), 2)     AS humidity_min,
                ROUND(MAX(humidity), 2)     AS humidity_max,
                ROUND(AVG(humidity), 2)     AS humidity_avg,
                ROUND(MIN(pressure), 2)     AS pressure_min,
                ROUND(MAX(pressure), 2)     AS pressure_max,
                ROUND(AVG(pressure), 2)     AS pressure_avg,
                ROUND(MIN(gas_resistance), 2) AS gas_resistance_min,
                ROUND(MAX(gas_resistance), 2) AS gas_resistance_max,
                ROUND(AVG(gas_resistance), 2) AS gas_resistance_avg,
                ROUND(MIN(pm1_0), 2)        AS pm1_0_min,
                ROUND(MAX(pm1_0), 2)        AS pm1_0_max,
                ROUND(AVG(pm1_0), 2)        AS pm1_0_avg,
                ROUND(MIN(pm25), 2)         AS pm25_min,
                ROUND(MAX(pm25), 2)         AS pm25_max,
                ROUND(AVG(pm25), 2)         AS pm25_avg,
                ROUND(MIN(pm10), 2)         AS pm10_min,
                ROUND(MAX(pm10), 2)         AS pm10_max,
                ROUND(AVG(pm10), 2)         AS pm10_avg,
                ROUND(MIN(altitude), 2)     AS altitude_min,
                ROUND(MAX(altitude), 2)     AS altitude_max,
                ROUND(AVG(altitude), 2)     AS altitude_avg,
                COUNT(*)                    AS reading_count
            FROM readings
            WHERE timestamp >= :cutoff
            GROUP BY DATE(timestamp, 'localtime')
            ORDER BY day ASC
        """), {"cutoff": cutoff.isoformat()}).fetchall()

        return [dict(r._mapping) for r in rows]

    elif granularity == "hourly":
        if not date:
            date = datetime.utcnow().strftime("%Y-%m-%d")

        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

        # Get total readings count for the day to decide granularity
        total = db.query(func.count(models.SensorReading.id)).filter(
            func.date(models.SensorReading.timestamp, 'localtime') == date
        ).scalar()

        # If fewer than 3 readings per hour on average → use 5-minute buckets
        use_5min = total < (3 * 24)

        if use_5min:
            # 5-minute bucket: STRFTIME rounds down to nearest 5 minutes
            time_bucket = "STRFTIME('%Y-%m-%dT%H:', timestamp) || PRINTF('%02d', (CAST(STRFTIME('%M', timestamp) AS INTEGER) / 5) * 5)"
            bucket_label = "bucket_5min"
        else:
            time_bucket = "STRFTIME('%Y-%m-%dT%H:00', timestamp)"
            bucket_label = "hour"

        rows = db.execute(text(f"""
            SELECT
                {time_bucket}               AS {bucket_label},
                ROUND(AVG(temperature), 2)  AS temperature,
                ROUND(AVG(humidity), 2)     AS humidity,
                ROUND(AVG(pressure), 2)     AS pressure,
                ROUND(AVG(gas_resistance), 2) AS gas_resistance,
                ROUND(AVG(pm1_0), 2)        AS pm1_0,
                ROUND(AVG(pm25), 2)         AS pm25,
                ROUND(AVG(pm10), 2)         AS pm10,
                ROUND(AVG(altitude), 2)     AS altitude,
                COUNT(*)                    AS reading_count
            FROM readings
            WHERE DATE(timestamp, 'localtime') = :query_date
            GROUP BY {time_bucket}
            ORDER BY {bucket_label} ASC
        """), {"query_date": date}).fetchall()

        return {
            "date": date,
            "granularity": "5min" if use_5min else "hourly",
            "readings": [dict(r._mapping) for r in rows]
        }

    raise HTTPException(status_code=400, detail="granularity must be 'daily' or 'hourly'")


# ==========================================
# Health Tracking Endpoints
# ==========================================

@app.post("/api/symptoms")
def log_symptom(log: SymptomLog, db: Session = Depends(get_db)):
    symptoms_str = ",".join(log.symptoms)
    new_entry = models.SymptomEntry(date=log.date, symptoms=symptoms_str, notes=log.notes)
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    return {"status": "success", "id": new_entry.id}

@app.get("/api/symptoms")
def get_symptoms(db: Session = Depends(get_db)):
    entries = db.query(models.SymptomEntry).order_by(models.SymptomEntry.timestamp.desc()).limit(10).all()
    return entries


# ==========================================
# Authentication Endpoints
# ==========================================

@app.post("/register")
def register(user: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    new_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        city="San Francisco, CA",
        age=user.age
    )
    db.add(new_user)
    db.commit()
    return {"status": "success", "message": "User created"}

@app.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    if not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {
        "status": "success",
        "user": {"email": db_user.email, "full_name": db_user.full_name, "city": db_user.city}
    }


# ==========================================
# Regional AQI (Map Tab)
# ==========================================

def aqi_category(aqi):
    if aqi is None: return "Unknown"
    if aqi <= 50:   return "Good"
    if aqi <= 100:  return "Moderate"
    if aqi <= 150:  return "Unhealthy for Sensitive Groups"
    if aqi <= 200:  return "Unhealthy"
    if aqi <= 300:  return "Very Unhealthy"
    return "Hazardous"

@app.get("/api/nearby")
def get_nearby_clean_air(lat: float, lon: float):
    WAQI_TOKEN = "4d8e188fe760559367184a6d1a368cdcf6c390c5"
    
    # Create a ~50km bounding box around the user's location
    lat1, lon1 = lat - 0.5, lon - 0.5
    lat2, lon2 = lat + 0.5, lon + 0.5
    
    url = f"https://api.waqi.info/v2/map/bounds?latlng={lat1},{lon1},{lat2},{lon2}&networks=all&token={WAQI_TOKEN}"
    try:
        res = http_requests.get(url, timeout=5).json()
        if res.get("status") == "ok":
            data = res.get("data", [])
            valid_stations = []
            
            for s in data:
                aqi = s.get("aqi")
                if aqi and str(aqi).isdigit():
                    valid_stations.append({
                        "city": s.get("station", {}).get("name", "Unknown Station").split(',')[0],
                        "aqi": int(aqi),
                        "lat": s.get("lat"),
                        "lon": s.get("lon")
                    })
            
            # Sort by AQI ascending (cleanest first)
            valid_stations.sort(key=lambda x: x["aqi"])
            
            # Filter out duplicates (WAQI often returns multiple sensors per city)
            seen_cities = set()
            unique_top = []
            for s in valid_stations:
                if s["city"] not in seen_cities:
                    seen_cities.add(s["city"])
                    s["category"] = aqi_category(s["aqi"])
                    unique_top.append(s)
                if len(unique_top) == 4:
                    break
                    
            return {"cities": unique_top, "updatedAt": datetime.utcnow().isoformat()}
    except Exception as e:
        print(f"Error fetching nearby clean air: {e}")
        
    return {"cities": []}
