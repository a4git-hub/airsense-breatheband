import asyncio
import sys
from bleak import BleakScanner, BleakClient

# These match the UUIDs from your ESP32 Arduino sketch
SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
DEVICE_NAME = "BLE Server Example"

def notification_handler(sender, data):
    """Simple notification handler which prints the data received."""
    try:
        decoded_data = data.decode('utf-8')
        print(f"\n--- New Sensor Data Received ({len(decoded_data)} bytes) ---")
        
        # Parse the comma-separated string (e.g. "T:25.4,H:45.2,P:1013.2,G:45.1,PM1.0:10,PM2.5:15,PM10:20")
        if "Initializing" in decoded_data:
            print(decoded_data)
        else:
            parts = decoded_data.split(',')
            for part in parts:
                if ':' in part:
                    key, val = part.split(':')
                    # Give them nice names for printing
                    nice_names = {
                        "T": "Temperature (°C)",
                        "H": "Humidity (%)",
                        "P": "Pressure (hPa)",
                        "G": "Gas Resistance (KOhms)",
                        "PM1.0": "PM 1.0 (std)",
                        "PM2.5": "PM 2.5 (std)",
                        "PM10": "PM 10 (std)"
                    }
                    print(f"  {nice_names.get(key, key)}: {val}")
                else:
                    print(f"  Unknown data format: {part}")
            print("-" * 40)
            
    except Exception as e:
        print(f"Error decoding data: {e} | Raw data: {data}")


async def main():
    print("Scanning for BLE devices (this may take 10 seconds)...")
    
    # Discover devices, returning advertisement data directly. 
    # Increased timeout makes MacOS discovery more robust.
    devices_and_adv_data = await BleakScanner.discover(timeout=10.0, return_adv=True)
    
    target_device = None
    
    for address, (device, adv_data) in devices_and_adv_data.items():
        has_correct_uuid = SERVICE_UUID.lower() in [u.lower() for u in adv_data.service_uuids]
        
        if device.name == DEVICE_NAME or has_correct_uuid:
            target_device = device
            break
            
    if not target_device:
        print(f"\nCould not find a device broadcasting name '{DEVICE_NAME}' or service '{SERVICE_UUID}'.")
        print("\n=== macOS Troubleshooting ===")
        print("1. Permission Denied?: MacOS requires explicitly granting...")
        return

    print(f"Found ESP32: {target_device.name} (Address: {target_device.address})")
    print("Connecting...")

    try:
        async with BleakClient(target_device.address) as client:
            print(f"Successfully connected to {target_device.name}!")
            
            # Start notifications
            print(f"Subscribing to characteristic UUID: {CHARACTERISTIC_UUID}...")
            await client.start_notify(CHARACTERISTIC_UUID, notification_handler)
            print("Listening for sensor data. Press Ctrl+C to stop.")
            
            # Keep the script running to continue receiving notifications
            while True:
                await asyncio.sleep(1)
                
    except asyncio.CancelledError:
        print("\nDisconnecting...")
    except Exception as e:
         print(f"An error occurred: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nProgram terminated by user.")
        sys.exit(0)
