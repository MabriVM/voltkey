#pragma once

#include <stdint.h>
#include <string.h>

extern uint8_t ArduinoStubEeprom[1024];

class EEPROMStub {
 public:
  uint8_t read(int address) const { return address >= 0 && address < 1024 ? ArduinoStubEeprom[address] : 0xFF; }
  void update(int address, uint8_t value) { if (address >= 0 && address < 1024) ArduinoStubEeprom[address] = value; }
  template <typename T> void put(int address, const T &value) { if (address >= 0 && address + (int)sizeof(T) <= 1024) memcpy(ArduinoStubEeprom + address, &value, sizeof(T)); }
  template <typename T> void get(int address, T &value) const { if (address >= 0 && address + (int)sizeof(T) <= 1024) memcpy(&value, ArduinoStubEeprom + address, sizeof(T)); }
};

extern EEPROMStub EEPROM;
