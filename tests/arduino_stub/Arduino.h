#pragma once

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT 0
#define INPUT_PULLUP 2
#define LED_BUILTIN 13
#define A0 14
#define A1 15
#define A2 16

class __FlashStringHelper;
#define F(value) (reinterpret_cast<const __FlashStringHelper*>(value))

class SerialStub {
 public:
  void begin(unsigned long) {}
  int available() { return 0; }
  int read() { return -1; }
  void print(const char*) {}
  void print(const __FlashStringHelper*) {}
  void print(char) {}
  void print(int) {}
  void print(unsigned int) {}
  void println() {}
  void println(const char*) {}
  void println(const __FlashStringHelper*) {}
  void println(char) {}
  void println(int) {}
  void println(unsigned int) {}
};

extern SerialStub Serial;
extern unsigned long ArduinoStubMillis;
extern uint8_t ArduinoStubPinValues[32];
inline void pinMode(uint8_t, uint8_t) {}
inline void digitalWrite(uint8_t pin, uint8_t value) { if (pin < 32) ArduinoStubPinValues[pin] = value; }
inline int digitalRead(uint8_t pin) { return pin < 32 ? ArduinoStubPinValues[pin] : HIGH; }
inline unsigned long millis() { return ArduinoStubMillis; }
inline void delay(unsigned long duration) { ArduinoStubMillis += duration; }
template <typename T> inline T min(T a, T b) { return a < b ? a : b; }
template <typename T> inline T constrain(T value, T low, T high) { return value < low ? low : value > high ? high : value; }
