# AirSense: Design Decisions & Project Log

**Project:** Wearable Air Quality Monitor (Science Fair)
**Date:** 2026-02-02

---

## 1. System Architecture
### **Why Python FastAPI?**
*   **Decision:** We chose **FastAPI** over Flask or Django.
*   **Reasoning:** 
    *   **Speed:** It is one of the fastest Python frameworks (critical for real-time sensor data).
    *   **Validation:** Automatic data validation with `Pydantic` ensures our sensor data (floats, ints) is clean before it hits the database.
    *   **Documentation:** It auto-generates Swagger/OpenAPI docs, which is excellent for testing our API endpoints during development.

### **Communication Protocol**
*   **Decision:** **REST API (Polling)** instead of WebSockets.
*   **Reasoning:** While WebSockets offer true "real-time" streaming, they introduce complexity (connection state management). For a science fair demo, polling the server every 2-5 seconds is indistinguishable from real-time and significantly more robust against WiFi disconnects.

### **Database Strategy**
*   **Decision:** **SQLite** with **SQLAlchemy**.
*   **Reasoning:** A serverless, file-based database is perfect for embedded/local demos. No need to run a separate Docker container for Postgres. SQLAlchemy allows us to switch to a "real" database later if needed.

---

## 2. Hardware Design Choices
### **Microcontroller: ESP32-C3**
*   **Choice:** RISC-V based ESP32-C3.
*   **Why?** Native WiFi and Bluetooth 5.0 in a tiny package. It handles the I2C sensors effortlessly and has enough RAM to buffer data if WiFi drops.

### **Sensors: The I2C Pivot**
*   **Original Plan:** Generic sensors.
*   **Final Decision:** 
    *   **PM2.5:** PMSA003I (Adafruit) -> Uses I2C.
    *   **Environmental:** BME680 -> Uses I2C.
*   **Benefit:** This simplifies wiring enormously. Instead of managing multiple UART/Analog pins, both sensors share the **same two wires (SDA/SCL)**.

### **Feedback Mechanisms**
*   **Visual:** NeoPixel (RGB Ring) to show AQI Colors (Green=Good, Red=Bad) instantly on the device.
*   **Haptic:** Vibration Motor for "Hazardous" alerts.
*   **Safety Critical:** We added a **BC547 Transistor** to drive the motor.
    *   *Constraint:* The ESP32 GPIO pins only output ~40mA. A motor draws ~70mA+. Direct connection would damage the chip. The transistor acts as a high-current switch.

### **Power Strategy**
*   **Decision:** USB Power Bank.
*   **Rejected:** 100mAh LiPo Battery.
*   **Reasoning:** The computed runtime on 100mAh was <25 minutes. A USB bank ensures the project runs all day during judging without recharging.

---

## 3. Frontend & User Experience
### **"Traffic Light" UI**
*   We adopted a strict color code (Green/Yellow/Orange/Red/Purple) that mirrors the **EPA AQI standards**. This makes the data instantly interpretable by judges.

### **Authentication Security**
*   **Problem:** Storing user passwords safely.
*   **Solution:** Implemented **Bcrypt Hashing**.
    *   *Challenge:* Encountered a version mismatch between `passlib` and `bcrypt 5.0`.
    *   *Fix:* Downgraded to `bcrypt 3.2.2/4.0.1` to ensure stability.

### **Forecasting Logic**
*   **Problem:** The API returned raw data that included past days and unordered readings.
*   **Fix:** We implemented a frontend filter to:
    1.  Discard dates `< Today`.
    2.  Sort chronologically.
    3.  Slice the next 7 days.
    4.  Identify the "2 Cleanest Days" for the Insight feature.

---

## 4. Current Status
*   **Software:** 100% Complete (Backend, Database, Frontend).
*   **Hardware:** Parts arrived (ESP32-C3, PMSA003I, BME680).
*   **Next Phase:** Firmware Development (MicroPython/C++) to bridge the Hardware and Software.
