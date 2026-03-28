#include <WS2812FX.h>

// --- Pin & Ring Config ---
// Change LED_PIN here if your data wire is on a different pin
const int LED_PIN = D3; // D3 = GPIO 5 on Xiao ESP32-C3
const int LED_COUNT = 12;

WS2812FX ws2812fx = WS2812FX(LED_COUNT, LED_PIN, NEO_RGB + NEO_KHZ800);

// Colors to cycle through every 2 seconds
uint32_t colors[] = {
    0x00FF00, // Green
    0xFFFF00, // Yellow
    0xFFA500, // Orange
    0xFF0000  // Red
};
const int COLOR_COUNT = 4;
int currentColor = 0;

unsigned long lastColorChange = 0;
const unsigned long colorInterval = 2000; // Change color every 2 seconds

void setup() {
  Serial.begin(115200);
  Serial.println("LED Test starting...");

  ws2812fx.init();
  ws2812fx.setBrightness(200);
  ws2812fx.setMode(FX_MODE_STATIC);
  ws2812fx.setColor(colors[currentColor]);
  ws2812fx.start();

  Serial.println("LED ring started. Should show GREEN.");
}

void loop() {
  ws2812fx.service();

  unsigned long now = millis();
  if (now - lastColorChange >= colorInterval) {
    lastColorChange = now;
    currentColor = (currentColor + 1) % COLOR_COUNT;
    ws2812fx.setColor(colors[currentColor]);
    Serial.print("Color changed to index: ");
    Serial.println(currentColor);
  }
}
