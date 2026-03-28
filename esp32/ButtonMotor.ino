#include <WS2812FX.h>

// constants won't change. They're used here to set pin numbers:
const int buttonPin = 8;  // the number of the pushbutton pin
const int transistorPin = 10;    // the number of the LED pin

#define LED_COUNT 12
#define LED_PIN 9

// Parameter 1 = number of pixels in strip
// Parameter 2 = Arduino pin number (most are valid)
// Parameter 3 = pixel type flags, add together as needed:
//   NEO_KHZ800  800 KHz bitstream (most NeoPixel products w/WS2812 LEDs)
//   NEO_KHZ400  400 KHz (classic 'v1' (not v2) FLORA pixels, WS2811 drivers)
//   NEO_GRB     Pixels are wired for GRB bitstream (most NeoPixel products)
//   NEO_RGB     Pixels are wired for RGB bitstream (v1 FLORA pixels, not v2)
//   NEO_RGBW    Pixels are wired for RGBW bitstream (NeoPixel RGBW products)
WS2812FX ws2812fx = WS2812FX(LED_COUNT, LED_PIN, NEO_RGB + NEO_KHZ800);

// variables will change:
int buttonState = 0;  // variable for reading the pushbutton status

void setup() {
  Serial.begin(9600);
  Serial.println("Starting Button press motor run!");

  ws2812fx.init();
  ws2812fx.setBrightness(128);
  ws2812fx.setMode(FX_MODE_RANDOM_COLOR);

  // initialize the LED pin as an output:
  pinMode(transistorPin, OUTPUT);
  // initialize the pushbutton pin as an input:
  pinMode(buttonPin, INPUT);
}

void loop() {
  ws2812fx.service(); // Keep this at the top

  buttonState = digitalRead(buttonPin);

  if (buttonState == HIGH) {
    digitalWrite(transistorPin, HIGH);
    
    // Only start if it's not already running to avoid flickering
    if (!ws2812fx.isRunning()) {
      ws2812fx.start();
    }
    
    Serial.println("Button pressed, Motor vibrating");
  } else {
    digitalWrite(transistorPin, LOW);
    
    // Stop the animation and turn off LEDs
    ws2812fx.stop(); 
  }
}
