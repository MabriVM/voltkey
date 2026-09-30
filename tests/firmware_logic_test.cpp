#include <assert.h>
#include <string.h>
#include "arduino_stub/Arduino.h"
#include "arduino_stub/EEPROM.h"
SerialStub Serial; EEPROMStub EEPROM; unsigned long ArduinoStubMillis=0;
uint8_t ArduinoStubPinValues[32]; uint8_t ArduinoStubEeprom[1024];
#include "../arduino/VoltKey_Uno_R3/VoltKey_Uno_R3.ino"

int main(){
  memset(ArduinoStubEeprom,0xFF,sizeof(ArduinoStubEeprom));
  memset(ArduinoStubPinValues,HIGH,sizeof(ArduinoStubPinValues));
  ArduinoStubPinValues[A0]=HIGH; setup();
  assert(cardPresent && outputs[0] && !outputs[1] && !outputs[2]);
  assert(ArduinoStubPinValues[LED_BUILTIN]==HIGH);
  assert(ArduinoStubPinValues[12]==HIGH && ArduinoStubPinValues[11]==LOW && ArduinoStubPinValues[10]==LOW);

  char generalOff[]="VK1|SET|1|0|master"; command(generalOff);
  assert(!outputs[0] && !outputs[1] && !outputs[2]);
  char floorOn[]="VK1|SET|2|1|floor"; command(floorOn);
  assert(!outputs[1]);
  char generalOn[]="VK1|SET|1|1|master-on"; command(generalOn);
  char floorOn2[]="VK1|SET|2|1|floor-on"; command(floorOn2);
  assert(outputs[0] && outputs[1]);
  assert(ArduinoStubPinValues[12]==HIGH && ArduinoStubPinValues[11]==HIGH);

  char relayCfg[]="VK1|RELAYCFG|2|9|1"; command(relayCfg);
  assert(cfg.pins[1]==9 && (cfg.activeLow&2));
  assert(ArduinoStubPinValues[9]==LOW); // Relé/LED activo LOW y circuito encendido.
  char cardLedCfg[]="VK1|CARDLEDCFG|8|0|500"; command(cardLedCfg);
  assert(cfg.cardLedPin==8 && cardBlinkMs()==500);
  assert(ArduinoStubPinValues[8]==HIGH && ArduinoStubPinValues[LED_BUILTIN]==LOW);
  char emergencyCommand[]="VK1|ESTOP|stop"; command(emergencyCommand);
  assert(outputs[0] && !outputs[1] && !outputs[2]);

  char gridOff[]="VK1|GRIDSET|0|grid-off"; command(gridOff);
  assert(!gridAvailable && cardLedMode()==CARD_LED_OUTAGE_BLINK && ArduinoStubPinValues[8]==HIGH);
  ArduinoStubMillis+=500; policy(); assert(ArduinoStubPinValues[8]==LOW);
  ArduinoStubMillis+=500; policy(); assert(ArduinoStubPinValues[8]==HIGH);
  char gridOn[]="VK1|GRIDSET|1|grid-on"; command(gridOn);
  assert(gridAvailable && cardLedMode()==CARD_LED_STEADY && ArduinoStubPinValues[8]==HIGH);

  ArduinoStubPinValues[A0]=LOW; ArduinoStubMillis+=50; readCard();
  assert(cardPresent && ArduinoStubPinValues[8]==HIGH);
  ArduinoStubPinValues[A0]=HIGH; ArduinoStubMillis+=50; readCard();
  assert(!cardPresent);
  assert(shutdownPending);
  assert(cardLedMode()==CARD_LED_COUNTDOWN_BLINK);
  assert(ArduinoStubPinValues[8]==HIGH);
  ArduinoStubMillis+=999; policy(); assert(ArduinoStubPinValues[8]==HIGH);
  ArduinoStubMillis+=1; policy(); assert(ArduinoStubPinValues[8]==LOW);
  ArduinoStubMillis=shutdownStarted+(unsigned long)cfg.delaySeconds*1000UL; policy();
  assert(outputs[0] && !outputs[1] && !outputs[2] && cardLedMode()==CARD_LED_OFF && ArduinoStubPinValues[8]==LOW);
  char cardIn[]="VK1|CARDSET|1|card-in"; command(cardIn);
  assert(cardPresent && cardLedMode()==CARD_LED_STEADY && ArduinoStubPinValues[8]==HIGH);
  char cardLedLowCfg[]="VK1|CARDLEDCFG|8|1|500"; command(cardLedLowCfg);
  assert((cfg.cardLedFlags&CARD_LED_ACTIVE_LOW) && ArduinoStubPinValues[8]==LOW);

  bool rememberedGeneral=outputs[0]; load();
  assert(outputs[0]==rememberedGeneral && cfg.pins[1]==9 && cfg.cardLedPin==8 && cfg.schema==6);
  return 0;
}
