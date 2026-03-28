#include "Adafruit_BME680.h"
#include "Adafruit_PM25AQI.h"
#include <Adafruit_Sensor.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <SPI.h>
#include <WS2812FX.h>
#include <Wire.h>

// --- NeoPixel & Motor Pins ---
// LED_PIN = D3 confirmed working on Xiao ESP32-C3 with this hardware
const int transistorPin = D0; // D0 = GPIO 2
const int LED_PIN = D3;       // D3 = GPIO 5 — confirmed working in LEDTest
#define LED_COUNT 12

WS2812FX ws2812fx = WS2812FX(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// See the following for generating UUIDs:
// https://www.uuidgenerator.net/

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define SEALEVELPRESSURE_HPA (1013.25)

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;

Adafruit_PM25AQI aqi = Adafruit_PM25AQI();
Adafruit_BME680 bme; // I2C

unsigned long lastSensorReadTime = 0;
const unsigned long sensorReadInterval = 5000; // Read sensors every 5 seconds

unsigned long motorStartTime = 0;
bool isMotorRunning = false;
const unsigned long motorRunDuration = 750; // Motor vibrates for 0.75 seconds

unsigned long ledStartTime = 0;
bool isLedOn = false;
const unsigned long ledPulseDuration = 750; // LED blinks for 0.75 seconds

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    Serial.println("Client connected!");
    deviceConnected = true;
  };

  void onDisconnect(BLEServer *pServer) {
    Serial.println("Client disconnected. Restarting advertising...");
    deviceConnected = false;
    BLEDevice::startAdvertising();
  }
};

// Drive the ring directly via the underlying NeoPixel API.
// Bypasses WS2812FX's animation timer, which BLE can block/delay.
void showColor(uint32_t color, const char *name) {
  Serial.print("Ring color -> ");
  Serial.println(name);
  for (int i = 0; i < LED_COUNT; i++) {
    ws2812fx.setPixelColor(i, color);
  }
  ws2812fx.show();
}

void setup() {
  Serial.begin(115200);
  Serial.println("Starting BLE and Sensor initialization!");

  // --- Sensor Initialization ---
  delay(3000); // Wait for sensors to boot up

  if (!aqi.begin_I2C()) {
    Serial.println("Could not find PM 2.5 sensor!");
    while (1)
      delay(10);
  }

  if (!bme.begin()) {
    Serial.println(F("Could not find a valid BME680 sensor, check wiring!"));
    while (1)
      ;
  }

  // Set up oversampling and filter initialization
  bme.setTemperatureOversampling(BME680_OS_8X);
  bme.setHumidityOversampling(BME680_OS_2X);
  bme.setPressureOversampling(BME680_OS_4X);
  bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
  bme.setGasHeater(320, 150); // 320*C for 150 ms

  // --- WS2812FX Init ---
  ws2812fx.init();
  ws2812fx.setBrightness(200);
  // LED starts OFF — it only lights with motor pulses when PM2.5 is elevated

  // --- Motor Pin ---
  pinMode(transistorPin, OUTPUT);
  analogWrite(transistorPin, 0);

  // --- BLE Initialization ---
  if (!BLEDevice::init("BLE Server Example")) {
    Serial.println("BLE initialization failed!");
    return;
  }

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_READ |
                               BLECharacteristic::PROPERTY_WRITE |
                               BLECharacteristic::PROPERTY_NOTIFY);

  pCharacteristic->setValue("Sensors Initializing...");
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("Characteristic defined! Now you can read/subscribe to it "
                 "from your phone/client!");
}

void loop() {
  // NOTE: ws2812fx.service() removed — we drive LEDs directly via showColor()
  // to avoid BLE interrupt timing conflicts with the animation engine.

  unsigned long currentMillis = millis();

  // Stop motor after motorRunDuration (motor has its own independent timer)
  if (isMotorRunning && (currentMillis - motorStartTime >= motorRunDuration)) {
    analogWrite(transistorPin, 0);
    isMotorRunning = false;
  }

  // Turn off LED after ledPulseDuration (LED has its own independent timer)
  if (isLedOn && (currentMillis - ledStartTime >= ledPulseDuration)) {
    showColor(0x000000, "Off");
    isLedOn = false;
  }

  // Non-blocking sensor reading every 5 seconds
  if (currentMillis - lastSensorReadTime >= sensorReadInterval) {
    lastSensorReadTime = currentMillis;

    // 1. Read BME680 Data
    if (!bme.performReading()) {
      Serial.println("Failed to perform BME680 reading :(");
      return;
    }
    float temp = bme.temperature;
    float hum = bme.humidity;
    float pres = bme.pressure / 100.0;
    float gas = bme.gas_resistance / 1000.0;

    // 2. Read PM2.5 AQI Data
    PM25_AQI_Data data;
    bool aqiSuccess = aqi.read(&data);

    // 3. Construct Data String
    String sensorData = "T:" + String(temp, 1) + ",H:" + String(hum, 1) +
                        ",P:" + String(pres, 1) + ",G:" + String(gas, 1);

    if (aqiSuccess) {
      uint16_t pm25 = data.pm25_standard;
      Serial.print("PM2.5: ");
      Serial.println(pm25);

      // All zones blink LED for 750ms; motor only activates for PM2.5 > 35.
      if (pm25 <= 12) {
        showColor(0x00FF00, "Green pulse"); // Green LED blink, no motor
        ledStartTime = currentMillis;
        isLedOn = true;
        analogWrite(transistorPin, 0);
        isMotorRunning = false;
      } else if (pm25 <= 35) {
        showColor(0xFFFF00, "Yellow pulse"); // Yellow LED blink, no motor
        ledStartTime = currentMillis;
        isLedOn = true;
        analogWrite(transistorPin, 0);
        isMotorRunning = false;
      } else if (pm25 <= 55) {
        showColor(0xFFA500, "Orange pulse"); // Orange LED + motor
        ledStartTime = currentMillis;
        isLedOn = true;
        analogWrite(transistorPin, 128);
        motorStartTime = currentMillis;
        isMotorRunning = true;
      } else {
        showColor(0xFF0000, "Red pulse"); // Red LED + motor
        ledStartTime = currentMillis;
        isLedOn = true;
        analogWrite(transistorPin, 255);
        motorStartTime = currentMillis;
        isMotorRunning = true;
      }

      sensorData += ",PM1.0:" + String(data.pm10_standard) +
                    ",PM2.5:" + String(data.pm25_standard) +
                    ",PM10:" + String(data.pm100_standard);
    } else {
      sensorData += ",PM1.0:ERR,PM2.5:ERR,PM10:ERR";
    }

    Serial.println("Sensor Data: " + sensorData);

    // 4. Update BLE Characteristic
    pCharacteristic->setValue(sensorData.c_str());
    if (deviceConnected) {
      pCharacteristic->notify();
    }
  }
}
