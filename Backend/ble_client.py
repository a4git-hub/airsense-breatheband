"""
ble_client.py — AirSense BLE Client (Integrated Module)
=========================================================
Designed to be imported by main.py and started as a FastAPI background task.

- `live_data`        : in-memory dict always holding the latest ESP32 reading.
                       Updated every 5 seconds (ESP32 send rate).
- `run_ble_client()` : async coroutine — start it via asyncio.create_task()
                       from the FastAPI lifespan handler.
- DB writes happen every 60 seconds via `db_writer_task`, not on every notification.

ESP32 sends UTF-8 CSV strings via BLE NOTIFY, e.g.:
    "T:25.4,H:45.2,P:1013.2,G:45.1,PM1.0:10,PM2.5:15,PM10:20"
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from bleak import BleakScanner, BleakClient

# ─── Configuration ────────────────────────────────────────────────────────────
SERVICE_UUID        = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
DEVICE_NAME         = "BLE Server Example"   # Must match BLEDevice::init() in .ino

# If macOS is hiding the name/UUID, put the ESP32's MAC address here to force a match
# e.g., TARGET_MAC_ADDRESS = "A1:B2:C3:D4:E5:F6"
TARGET_MAC_ADDRESS  = None

SEA_LEVEL_HPA       = 1013.25
RECONNECT_DELAY_S   = 5
DB_WRITE_INTERVAL_S = 60   # How often to persist to SQLite

log = logging.getLogger("ble_client")

# ─── Shared In-Memory State ───────────────────────────────────────────────────
# FastAPI's /api/data/live returns this dict directly.
live_data: dict = {
    "connected":    False,
    "timestamp":    None,
    "temperature":  None,
    "humidity":     None,
    "pressure":     None,
    "gas_resistance": None,
    "pm1_0":        None,
    "pm25":         None,
    "pm10":         None,
    "altitude":     None,
}


# ─── Parsing ─────────────────────────────────────────────────────────────────

def parse_sensor_string(raw: str) -> Optional[dict]:
    """
    Parse the ESP32 CSV string into a sensor dict.
    Returns None for init/boot messages or unparseable strings.

    Input:  "T:25.4,H:45.2,P:1013.2,G:45.1,PM1.0:10,PM2.5:15,PM10:20"
    Output: {"temperature": 25.4, "humidity": 45.2, ..., "altitude": 85.3}
    """
    if not raw or "Initializing" in raw or "Init" in raw:
        log.info("BLE init message — skipping: %s", raw)
        return None

    parsed = {}
    for part in raw.strip().split(","):
        if ":" not in part:
            continue
        key, _, val = part.partition(":")
        key = key.strip()
        val = val.strip()

        if val.upper() == "ERR":
            log.warning("Sensor returned ERR for '%s' — skipping.", key)
            continue

        try:
            num = float(val)
        except ValueError:
            log.warning("Cannot parse value '%s' for key '%s'.", val, key)
            continue

        if   key == "T":     parsed["temperature"]   = round(num, 2)
        elif key == "H":     parsed["humidity"]       = round(num, 2)
        elif key == "P":     parsed["pressure"]       = round(num, 2)
        elif key == "G":     parsed["gas_resistance"] = round(num * 1000.0, 2)  # KΩ → Ω
        elif key == "PM1.0": parsed["pm1_0"]          = round(num, 2)
        elif key == "PM2.5": parsed["pm25"]           = round(num, 2)
        elif key == "PM10":  parsed["pm10"]           = round(num, 2)

    if not parsed:
        log.warning("Empty parsed payload — raw: %s", raw)
        return None

    # Derive altitude from pressure (barometric formula)
    if "pressure" in parsed:
        try:
            parsed["altitude"] = round(
                44330.0 * (1.0 - (parsed["pressure"] / SEA_LEVEL_HPA) ** 0.1903), 2
            )
        except Exception:
            pass

    return parsed


# ─── Notification Handler ────────────────────────────────────────────────────

def notification_handler(sender, data: bytearray):
    """
    Bleak calls this on every BLE NOTIFY from the ESP32 (~every 5s).
    Data arrives as bytearray (BLE wire format) and is decoded to UTF-8.
    Updates live_data in-memory only — DB write happens every 60s separately.
    """
    try:
        raw = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        log.error("BLE decode error: %s", exc)
        return

    log.info("📡 BLE notification: %s", raw)

    parsed = parse_sensor_string(raw)
    if parsed:
        live_data.update(parsed)
        live_data["connected"] = True
        live_data["timestamp"] = datetime.utcnow().isoformat()
        log.info("✅ live_data updated: temp=%.1f°C  PM2.5=%.1f",
                 parsed.get("temperature", 0), parsed.get("pm25", 0))
        # Explicit print so user can see it in the terminal output easily
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 📡 BAND DATA: {raw.strip()}")


# ─── Database Writer Task ────────────────────────────────────────────────────

async def db_writer_task():
    """
    Background task: saves a snapshot of live_data to SQLite every 60 seconds.
    Uses a direct SQLAlchemy session (not FastAPI's dependency-injected one).
    """
    # Import here to avoid circular import at module load time
    from database import SessionLocal
    import models

    log.info("🗄️  DB writer started — will persist every %ds.", DB_WRITE_INTERVAL_S)

    while True:
        await asyncio.sleep(DB_WRITE_INTERVAL_S)

        if live_data.get("temperature") is None:
            log.debug("DB writer: no live data yet — skipping.")
            continue

        try:
            db = SessionLocal()
            reading = models.SensorReading(
                temperature=live_data.get("temperature"),
                humidity=live_data.get("humidity"),
                pressure=live_data.get("pressure"),
                gas_resistance=live_data.get("gas_resistance"),
                pm25=live_data.get("pm25"),
                pm1_0=live_data.get("pm1_0"),
                pm10=live_data.get("pm10"),
                altitude=live_data.get("altitude"),
            )
            db.add(reading)
            db.commit()
            db.close()
            log.info("🗄️  DB snapshot saved.")
        except Exception as exc:
            log.error("DB write error: %s", exc)


# ─── BLE Discovery ───────────────────────────────────────────────────────────

async def find_device():
    """
    Scans for the ESP32 by name OR service UUID.
    """
    print("🔍 Scanning for BLE devices (10s)…")
    try:
        devices_and_adv = await BleakScanner.discover(timeout=10.0, return_adv=True)
    except Exception as exc:
        print(f"BLE scan error: {exc}")
        return None

    # Print all found devices to help debug connection issues
    print("\n--- Discovered BLE Devices ---")
    for _addr, (device, adv_data) in devices_and_adv.items():
        name = device.name or adv_data.local_name or "Unknown"
        
        # Print every single device we find so user can spot the ESP32 MAC
        print(f"  - {device.address} | Name: {name}")
            
        name_match = (name == DEVICE_NAME)
        
        # macOS sometimes returns UUIDs as objects, sometimes as strings
        adv_uuids = [str(u).lower() for u in adv_data.service_uuids]
        uuid_match = SERVICE_UUID.lower() in adv_uuids
        
        mac_match = TARGET_MAC_ADDRESS and (device.address.upper() == TARGET_MAC_ADDRESS.upper())
        
        if name_match:
            print(f"\n✅ Found ESP32: '{name}' ({device.address}) — matched by NAME")
            return device
        elif uuid_match:
            print(f"\n✅ Found ESP32: '{name}' ({device.address}) — matched by UUID ({SERVICE_UUID})")
            return device
        elif mac_match:
            print(f"\n✅ Found ESP32: '{name}' ({device.address}) — matched by TARGET_MAC_ADDRESS")
            return device

    print("------------------------------\n")
    return None


# ─── Main BLE Loop ───────────────────────────────────────────────────────────

async def run_ble_client():
    """
    Entry point — called by FastAPI lifespan as asyncio.create_task().
    Starts the DB writer task, then loops forever: scan → connect → listen → reconnect.
    """
    # Start background DB writer
    asyncio.create_task(db_writer_task())

    while True:
        device = await find_device()

        if not device:
            print(f"⚠️  Device '{DEVICE_NAME}' not found. Retry in {RECONNECT_DELAY_S}s…")
            live_data["connected"] = False
            await asyncio.sleep(RECONNECT_DELAY_S)
            continue

        print(f"🔗 Connecting to {device.address}…")
        try:
            async with BleakClient(device.address) as client:
                print("🟢 Connected! Subscribing to characteristic…")
                await client.start_notify(CHARACTERISTIC_UUID, notification_handler)
                print("👂 Listening for sensor data.")

                while client.is_connected:
                    await asyncio.sleep(1)

                print("🔴 Disconnected from device.")

        except asyncio.CancelledError:
            print("BLE task cancelled — shutting down.")
            live_data["connected"] = False
            return
        except Exception as exc:
            print(f"BLE connection error: {exc}")

        live_data["connected"] = False
        print(f"Retrying in {RECONNECT_DELAY_S}s…")
        await asyncio.sleep(RECONNECT_DELAY_S)
