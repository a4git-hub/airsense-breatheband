# AirSense Project Timeline 📅

**Start Date:** Feb 3, 2026  
**Target Completion:** Feb 25, 2026  
**Goal:** Complete Hardware, Firmware, and Testing before starting the Science Fair Board.

---

## 📅 Week 1: The "Life" Phase (Feb 3 - Feb 9)
**Goal:** Get the hardware wired and sensors breathing (reading data).

*   **Tue Feb 3:** 🔌 **Wiring Day.** Connect ESP32, Sensors (I2C), and Transistor/Motor following the guide.
*   **Wed Feb 4:** 💻 **Setup Firmware Env.** Install Thonny (for MicroPython) or Arduino IDE. Test "Blink" logic.
*   **Thu Feb 5:** 🌫️ **PMSA003I (PM2.5).** Write code to simply read air quality numbers and print to console.
*   **Fri Feb 6:** 🌡️ **BME680 (Env).** Write code to read Temp/Humidity/Pressure.
*   **Weekend (Feb 7-8):** 🌈 **Feedback Output.** Write code to make the NeoPixel change colors and the Motor buzz using dummy data.

**Milestone:** A "Frankenstein" device on your desk that reads air and lights up!

---

## 📅 Week 2: The "Connnectivity" Phase (Feb 10 - Feb 16)
**Goal:** Connect the device to the brain (Backend) and remove the cables.

*   **Mon Feb 10:** 📶 **WiFi Logic.** Get the ESP32 connecting to your home Hotspot.
*   **Tue Feb 11:** 📨 **API POST.** Send the sensor data to `http://<your-ip>:8000/api/data`.
*   **Wed Feb 12:** 🔄 **Integration Loop.**
    *   ESP32 sends data -> Backend receives it -> Frontend Map updates (Green bubble!).
*   **Thu Feb 13:** 🔋 **Power Test.** Run it off the USB Power Bank. See how long it lasts.
*   **Fri Feb 14 (Valentine's):** ❤️ **Data Logic.** Refine the "Traffic Light" thresholds (e.g., Make sure Red LED only turns on when PM2.5 > 50).
*   **Weekend (Feb 15-16):** 📦 **Enclosure v1.** Build a simple cardboard or plastic case to hold the wires/battery so it's "wearable".

**Milestone:** A portable device that updates your laptop screen wirelessly.

---

## 📅 Week 3: The "Science" Phase (Feb 17 - Feb 23)
**Goal:** Gather real data for your board and squash bugs.

*   **Mon Feb 17:** 🕯️ **Experiment 1 (Indoor).** Light a candle/incense safely. Does it detect the smoke? (Take photos!).
*   **Tue Feb 18:** 🌲 **Experiment 2 (Outdoor).** Walk around the block. Does the BME680 change temp?
*   **Wed Feb 19:** 🐛 **Bug Squash.** Fix any crashes or "frozen" sensors.
*   **Thu Feb 20:** 📊 **Data Export.** Learn how to export your DB data to Excel/CSV (I can help with this) for your Board graphs.
*   **Fri Feb 21:** ✨ **Code Polish.** Comment the code, clean up unused variables.
*   **Weekend (Feb 22-23):** 🎬 **Final Demo Prep.** Rehearse how you will show it to judges using the "Walkthrough" doc.

**Milestone:** Validated data proving your device actually works.

---

## 🏁 Final Countdown (Feb 24 - Feb 25)
*   **Mon Feb 24:** 📸 **Documentation.** Take high-res photos of the finished wiring and the UI.
*   **Tue Feb 25:** 🎉 **DONE.** Project Freezes. Transition to Board Design.

---
**Note:** I am here for every single day of this. If you get stuck on "Wed Feb 11" with WiFi, just ping me!
