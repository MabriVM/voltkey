/* VoltKey ARDUINO TEST 1.2 (base Alpha 1.12.0) - Arduino UNO R3.
   Rele 1 GENERAL (maestro), 2 PRIMER PISO, 3 SEGUNDO PISO.
   A0: tarjeta (LOW=presente). Indicador de tarjeta configurable D2-D13.
   Las salidas son logica de 5 V: nunca conectes 220/230 V directamente. */
#include <Arduino.h>
#include <EEPROM.h>

const char FIRMWARE_VERSION[] = "1.12.0";
const char ARDUINO_TEST_VERSION[] = "1.2";
const char SERVER_ROLE[] = "UNO-SERVER-USB";
const char PROTOCOL[] = "VK1";
const uint8_t COUNT = 3, CARD_INPUT_PIN = A0, DEFAULT_CARD_LED_PIN = LED_BUILTIN;
const uint8_t DEFAULT_PINS[COUNT] = {12, 11, 10};
const uint8_t CARD_LED_ACTIVE_LOW = 0x01;
const uint8_t CARD_LED_OFF = 0, CARD_LED_STEADY = 1, CARD_LED_OUTAGE_BLINK = 2, CARD_LED_COUNTDOWN_BLINK = 3;

struct StoreV4 {
  uint8_t a, b, schema, card, grid, out, essential, restore, delaySeconds;
  uint8_t pins[COUNT], activeLow, check;
};
struct StoreV5 {
  uint8_t a, b, schema, card, grid, out, essential, restore, delaySeconds;
  uint8_t pins[COUNT], activeLow, cardLedPin, cardLedFlags, cardBlinkUnits, check;
};
struct Store {
  uint8_t a, b, schema, card, grid, out, essential, restore, delaySeconds;
  uint8_t pins[COUNT], activeLow, cardLedPin, cardLedFlags, cardBlinkUnits, check;
};

Store cfg;
bool outputs[COUNT] = {true, false, false};
bool cardPresent = true, gridAvailable = true, shutdownPending = false;
bool previousCardInput = HIGH, linkOnline = false, cardLedPhase = true;
uint8_t previousCardLedMode = 0xFF;
unsigned long shutdownStarted = 0, lastInputChange = 0, lastReport = 0, lastHostContact = 0, cardLedLastToggle = 0;
uint32_t sequence = 0;
char lastCause[20] = "inicio", buffer[190];
uint8_t bufferLength = 0;

uint8_t checksumBytes(const uint8_t *data, uint8_t size) {
  uint8_t result = 0x5A;
  for (uint8_t index = 0; index < size - 1; index++) result ^= data[index];
  return result;
}
uint8_t checksum(const Store &value) { return checksumBytes((const uint8_t *)&value, sizeof(Store)); }
uint8_t checksumV4(const StoreV4 &value) { return checksumBytes((const uint8_t *)&value, sizeof(StoreV4)); }
uint8_t checksumV5(const StoreV5 &value) { return checksumBytes((const uint8_t *)&value, sizeof(StoreV5)); }

uint8_t outputMask() {
  uint8_t result = 0;
  for (uint8_t index = 0; index < COUNT; index++) if (outputs[index]) result |= 1 << index;
  return result;
}
bool validRelayPin(uint8_t pin) { return pin >= 2 && pin <= 12; }
bool relayMapValid(const uint8_t *pins) {
  for (uint8_t index = 0; index < COUNT; index++) {
    if (!validRelayPin(pins[index])) return false;
    for (uint8_t other = index + 1; other < COUNT; other++) if (pins[index] == pins[other]) return false;
  }
  return true;
}
bool cardLedPinValid(uint8_t pin) {
  if (pin < 2 || pin > 13) return false;
  for (uint8_t index = 0; index < COUNT; index++) if (cfg.pins[index] == pin) return false;
  return true;
}
bool mapValid() { return relayMapValid(cfg.pins) && cardLedPinValid(cfg.cardLedPin); }

void writeOutput(uint8_t index) {
  bool activeLow = (cfg.activeLow & (1 << index)) != 0;
  digitalWrite(cfg.pins[index], outputs[index] != activeLow ? HIGH : LOW);
}
void applyMask(uint8_t mask) {
  if (!(mask & 1)) mask = 0;
  for (uint8_t index = 0; index < COUNT; index++) {
    outputs[index] = (mask & (1 << index)) != 0;
    writeOutput(index);
  }
}
uint8_t cardLedMode() {
  if (!cardPresent) return shutdownPending ? CARD_LED_COUNTDOWN_BLINK : CARD_LED_OFF;
  if (!gridAvailable) return CARD_LED_OUTAGE_BLINK;
  return CARD_LED_STEADY;
}
const __FlashStringHelper *cardLedModeLabel(uint8_t mode) {
  if (mode == CARD_LED_STEADY) return F("steady");
  if (mode == CARD_LED_OUTAGE_BLINK) return F("outage_blink");
  if (mode == CARD_LED_COUNTDOWN_BLINK) return F("countdown_blink");
  return F("off");
}
bool cardLedLogicalOn() {
  uint8_t mode = cardLedMode();
  if (mode == CARD_LED_STEADY) return true;
  if (mode == CARD_LED_OUTAGE_BLINK || mode == CARD_LED_COUNTDOWN_BLINK) return cardLedPhase;
  return false;
}
void writeCardLed(bool logicalOn) {
  bool activeLow = (cfg.cardLedFlags & CARD_LED_ACTIVE_LOW) != 0;
  digitalWrite(cfg.cardLedPin, logicalOn != activeLow ? HIGH : LOW);
}
unsigned int cardBlinkMs() { return constrain((unsigned int)cfg.cardBlinkUnits * 100U, 200U, 2000U); }
unsigned int activeCardBlinkMs() { return cardLedMode() == CARD_LED_COUNTDOWN_BLINK ? 1000U : cardBlinkMs(); }
void updateCardLed(bool resetPhase = false) {
  uint8_t mode = cardLedMode();
  if (resetPhase || mode != previousCardLedMode) {
    cardLedPhase = mode != CARD_LED_OFF;
    cardLedLastToggle = millis();
  } else if (mode == CARD_LED_STEADY) cardLedPhase = true;
  else if (mode == CARD_LED_OFF) cardLedPhase = false;
  else if (millis() - cardLedLastToggle >= activeCardBlinkMs()) { cardLedPhase = !cardLedPhase; cardLedLastToggle = millis(); }
  previousCardLedMode = mode;
  writeCardLed(cardLedLogicalOn());
}

int countdownRemainingSeconds() {
  if (!shutdownPending) return -1;
  unsigned long duration = (unsigned long)cfg.delaySeconds * 1000UL;
  unsigned long elapsed = millis() - shutdownStarted;
  if (elapsed >= duration) return 0;
  return (int)((duration - elapsed + 999UL) / 1000UL);
}

void save() {
  cfg.a = 0x56; cfg.b = 0x4B; cfg.schema = 6; cfg.card = cardPresent; cfg.grid = gridAvailable;
  cfg.out = outputMask(); cfg.check = checksum(cfg); EEPROM.put(0, cfg);
}
void defaults() {
  memset(&cfg, 0, sizeof(cfg));
  cfg.essential = 1; cfg.delaySeconds = 5;
  for (uint8_t index = 0; index < COUNT; index++) cfg.pins[index] = DEFAULT_PINS[index];
  cfg.cardLedPin = DEFAULT_CARD_LED_PIN; cfg.cardLedFlags = 0; cfg.cardBlinkUnits = 10;
  cardPresent = true; gridAvailable = true; applyMask(1); save();
}
bool migrateV4() {
  StoreV4 oldCfg; EEPROM.get(0, oldCfg);
  bool valid = oldCfg.a == 0x56 && oldCfg.b == 0x4B && oldCfg.schema == 4
    && oldCfg.check == checksumV4(oldCfg) && relayMapValid(oldCfg.pins);
  if (!valid) return false;
  memset(&cfg, 0, sizeof(cfg));
  cfg.essential = oldCfg.essential; cfg.restore = oldCfg.restore; cfg.delaySeconds = oldCfg.delaySeconds; cfg.activeLow = oldCfg.activeLow;
  for (uint8_t index = 0; index < COUNT; index++) cfg.pins[index] = oldCfg.pins[index];
  cfg.cardLedPin = DEFAULT_CARD_LED_PIN; cfg.cardLedFlags = 0; cfg.cardBlinkUnits = 10;
  cardPresent = true; gridAvailable = oldCfg.grid != 0; applyMask(oldCfg.out & 7); save();
  return true;
}
bool migrateV5() {
  StoreV5 oldCfg; EEPROM.get(0, oldCfg);
  bool cardPinAvailable = oldCfg.cardLedPin >= 2 && oldCfg.cardLedPin <= 13;
  for (uint8_t index = 0; index < COUNT; index++) if (oldCfg.pins[index] == oldCfg.cardLedPin) cardPinAvailable = false;
  bool valid = oldCfg.a == 0x56 && oldCfg.b == 0x4B && oldCfg.schema == 5
    && oldCfg.check == checksumV5(oldCfg) && relayMapValid(oldCfg.pins)
    && cardPinAvailable;
  if (!valid) return false;
  memset(&cfg, 0, sizeof(cfg));
  cfg.essential = oldCfg.essential; cfg.restore = oldCfg.restore; cfg.delaySeconds = oldCfg.delaySeconds; cfg.activeLow = oldCfg.activeLow;
  for (uint8_t index = 0; index < COUNT; index++) cfg.pins[index] = oldCfg.pins[index];
  cfg.cardLedPin = oldCfg.cardLedPin; cfg.cardLedFlags = oldCfg.cardLedFlags & CARD_LED_ACTIVE_LOW;
  cfg.cardBlinkUnits = constrain(oldCfg.cardBlinkUnits, (uint8_t)2, (uint8_t)20);
  cardPresent = true; gridAvailable = oldCfg.grid != 0; applyMask(oldCfg.out & 7); save();
  return true;
}
void load() {
  EEPROM.get(0, cfg);
  bool currentValid = cfg.a == 0x56 && cfg.b == 0x4B && cfg.schema == 6
    && cfg.check == checksum(cfg) && mapValid() && cfg.cardBlinkUnits >= 2 && cfg.cardBlinkUnits <= 20;
  if (!currentValid) { if (!migrateV5() && !migrateV4()) defaults(); return; }
  cardPresent = true; gridAvailable = cfg.grid != 0; applyMask(cfg.out & 7); save();
}
void setCause(const char *value) { strncpy(lastCause, value, sizeof(lastCause) - 1); lastCause[sizeof(lastCause) - 1] = '\0'; }
void prefix(const __FlashStringHelper *value) { Serial.print(F("VK1|")); Serial.print(value); }
void hello() {
  prefix(F("HELLO")); Serial.print('|'); Serial.print(FIRMWARE_VERSION); Serial.print(F("|3|")); Serial.print(SERVER_ROLE); Serial.print('|'); Serial.println(ARDUINO_TEST_VERSION);
}
void state() {
  prefix(F("STATE"));
  Serial.print(F("|1:")); Serial.print(outputs[0]); Serial.print(F(",2:")); Serial.print(outputs[1]); Serial.print(F(",3:")); Serial.print(outputs[2]);
  Serial.print(F("|CARD:")); Serial.print(cardPresent); Serial.print(F("|GRID:")); Serial.print(gridAvailable);
  Serial.print(F("|ESS:")); Serial.print(cfg.essential); Serial.print(F("|DELAY:")); Serial.print(cfg.delaySeconds); Serial.print(F("|SEQ:")); Serial.print(sequence);
  Serial.print(F("|MAP:")); Serial.print(cfg.pins[0]); Serial.print(','); Serial.print(cfg.pins[1]); Serial.print(','); Serial.print(cfg.pins[2]);
  Serial.print(F("|ALOW:")); Serial.print(cfg.activeLow); Serial.print(F("|RLED:")); Serial.print(outputMask());
  Serial.print(F("|CLED:")); Serial.print(cfg.cardLedPin); Serial.print(','); Serial.print((cfg.cardLedFlags & CARD_LED_ACTIVE_LOW) != 0); Serial.print(','); Serial.print(cardBlinkMs()); Serial.print(','); Serial.print(cardLedLogicalOn()); Serial.print(','); Serial.print(cardLedModeLabel(cardLedMode()));
  Serial.print(F("|CDOWN:")); Serial.print(countdownRemainingSeconds());
  Serial.print(F("|LINK:")); Serial.print(linkOnline); Serial.print(F("|CAUSE:")); Serial.println(lastCause);
}

bool setCircuit(uint8_t id, bool requested, const char *origin) {
  if (id < 1 || id > 3) return false;
  uint8_t index = id - 1;
  bool allowed = (cfg.essential & (1 << index)) || (cardPresent && gridAvailable);
  if (index > 0 && requested && !outputs[0]) { requested = false; setCause("general_off"); }
  else setCause(origin);
  outputs[index] = requested && allowed;
  if (index == 0 && !outputs[0]) { outputs[1] = outputs[2] = false; writeOutput(1); writeOutput(2); }
  writeOutput(index); sequence++; save(); return true;
}
void setCard(bool inserted, const char *origin) {
  if (cardPresent == inserted) { updateCardLed(true); return; }
  cardPresent = inserted; setCause(origin);
  if (!inserted) { cfg.restore |= outputMask() & ~cfg.essential; shutdownPending = true; shutdownStarted = millis(); }
  else { shutdownPending = false; if (gridAvailable) applyMask(outputMask() | cfg.restore); cfg.restore = 0; }
  updateCardLed(true);
  sequence++; save();
}
void emergency() { applyMask(outputMask() & cfg.essential); shutdownPending = false; setCause("emergency"); sequence++; save(); }
void setGrid(bool available, const char *origin) {
  gridAvailable = available; if (!available) applyMask(outputMask() & cfg.essential);
  setCause(origin); sequence++; updateCardLed(true); save();
}
bool configureRelay(uint8_t slot, uint8_t pin, bool activeLow) {
  if (slot < 1 || slot > 3 || !validRelayPin(pin) || pin == cfg.cardLedPin) return false;
  uint8_t index = slot - 1;
  for (uint8_t other = 0; other < COUNT; other++) if (other != index && cfg.pins[other] == pin) return false;
  if (cfg.pins[index] != pin) pinMode(cfg.pins[index], INPUT);
  cfg.pins[index] = pin;
  if (activeLow) cfg.activeLow |= 1 << index; else cfg.activeLow &= ~(1 << index);
  digitalWrite(pin, activeLow ? HIGH : LOW); pinMode(pin, OUTPUT); writeOutput(index); save(); return true;
}
bool configureCardLed(uint8_t pin, bool activeLow, unsigned int blinkMs) {
  if (pin < 2 || pin > 13) return false;
  for (uint8_t index = 0; index < COUNT; index++) if (cfg.pins[index] == pin) return false;
  uint8_t oldPin = cfg.cardLedPin; bool oldActiveLow = (cfg.cardLedFlags & CARD_LED_ACTIVE_LOW) != 0;
  digitalWrite(oldPin, oldActiveLow ? HIGH : LOW); if (oldPin != pin) pinMode(oldPin, INPUT);
  cfg.cardLedPin = pin;
  cfg.cardLedFlags = activeLow ? CARD_LED_ACTIVE_LOW : 0;
  cfg.cardBlinkUnits = constrain((uint8_t)((blinkMs + 50U) / 100U), (uint8_t)2, (uint8_t)20);
  digitalWrite(pin, activeLow ? HIGH : LOW); pinMode(pin, OUTPUT); updateCardLed(true); save(); return true;
}

void command(char *line) {
  char *context = NULL, *protocol = strtok_r(line, "|", &context), *cmd = strtok_r(NULL, "|", &context);
  if (!protocol || !cmd || strcmp(protocol, PROTOCOL)) return;
  lastHostContact = millis(); linkOnline = true;
  if (!strcmp(cmd, "SET")) {
    char *slot = strtok_r(NULL, "|", &context), *value = strtok_r(NULL, "|", &context), *id = strtok_r(NULL, "|", &context);
    if (!slot || !value) return; uint8_t circuit = atoi(slot); if (!setCircuit(circuit, atoi(value) == 1, "app")) return;
    prefix(F("ACK")); Serial.print('|'); Serial.print(circuit); Serial.print('|'); Serial.print(outputs[circuit - 1]); Serial.print('|'); Serial.println(id ? id : "-"); state();
  } else if (!strcmp(cmd, "CARDSET")) {
    char *value = strtok_r(NULL, "|", &context), *id = strtok_r(NULL, "|", &context); if (!value) return;
    setCard(atoi(value) == 1, "app_card"); prefix(F("CARDACK")); Serial.print('|'); Serial.print(cardPresent); Serial.print('|'); Serial.println(id ? id : "-"); state();
  } else if (!strcmp(cmd, "GRIDSET")) {
    char *value = strtok_r(NULL, "|", &context), *id = strtok_r(NULL, "|", &context); if (value) {
      setGrid(atoi(value) == 1, atoi(value) == 1 ? "grid_restored" : "grid_outage");
      prefix(F("GRIDACK")); Serial.print('|'); Serial.print(gridAvailable); Serial.print('|'); Serial.println(id ? id : "-"); state();
    }
  } else if (!strcmp(cmd, "POLICY")) {
    char *essential = strtok_r(NULL, "|", &context), *delayValue = strtok_r(NULL, "|", &context);
    if (essential && delayValue) { cfg.essential = atoi(essential) & 7; cfg.delaySeconds = min((uint8_t)60, (uint8_t)atoi(delayValue)); save(); state(); }
  } else if (!strcmp(cmd, "RELAYCFG")) {
    char *slot = strtok_r(NULL, "|", &context), *pin = strtok_r(NULL, "|", &context), *low = strtok_r(NULL, "|", &context);
    bool ok = slot && pin && low && configureRelay(atoi(slot), atoi(pin), atoi(low) == 1); prefix(F("CFGACK")); Serial.print('|'); Serial.println(ok); state();
  } else if (!strcmp(cmd, "CARDLEDCFG")) {
    char *pin = strtok_r(NULL, "|", &context), *low = strtok_r(NULL, "|", &context), *third = strtok_r(NULL, "|", &context), *fourth = strtok_r(NULL, "|", &context);
    char *blink = fourth ? fourth : third;
    bool ok = pin && low && blink && configureCardLed(atoi(pin), atoi(low) == 1, atoi(blink));
    prefix(F("CARDLEDCFGACK")); Serial.print('|'); Serial.println(ok); state();
  } else if (!strcmp(cmd, "TESTRELAY")) {
    char *slotText = strtok_r(NULL, "|", &context), *durationText = strtok_r(NULL, "|", &context), *id = strtok_r(NULL, "|", &context);
    uint8_t slot = slotText ? atoi(slotText) : 0; unsigned int duration = durationText ? constrain(atoi(durationText), 50, 1000) : 250;
    if (slot >= 1 && slot <= 3) { bool old = outputs[slot - 1]; outputs[slot - 1] = !old; writeOutput(slot - 1); delay(duration); outputs[slot - 1] = old; writeOutput(slot - 1); }
    prefix(F("TESTACK")); Serial.print('|'); Serial.print(slot); Serial.print('|'); Serial.println(id ? id : "-");
  } else if (!strcmp(cmd, "TESTCARDLED")) {
    char *durationText = strtok_r(NULL, "|", &context), *id = strtok_r(NULL, "|", &context); unsigned int duration = durationText ? constrain(atoi(durationText), 50, 1000) : 250;
    writeCardLed(!cardLedLogicalOn()); delay(duration); updateCardLed(true); prefix(F("CARDLEDTESTACK")); Serial.print('|'); Serial.println(id ? id : "-");
  } else if (!strcmp(cmd, "SELFTEST")) {
    char *id = strtok_r(NULL, "|", &context); uint8_t old = EEPROM.read(100); EEPROM.update(100, old ^ 0x5A);
    bool eepromOk = EEPROM.read(100) == (uint8_t)(old ^ 0x5A); EEPROM.update(100, old);
    bool expectedHigh = cardLedLogicalOn() != ((cfg.cardLedFlags & CARD_LED_ACTIVE_LOW) != 0);
    bool cardLedOk = mapValid() && digitalRead(cfg.cardLedPin) == (expectedHigh ? HIGH : LOW);
    prefix(F("SELFTEST")); Serial.print('|'); Serial.print(eepromOk && mapValid() && cardLedOk); Serial.print(F("|EEPROM:")); Serial.print(eepromOk); Serial.print(F("|MAP:")); Serial.print(mapValid()); Serial.print(F("|CARDLED:")); Serial.print(cardLedOk); Serial.print('|'); Serial.println(id ? id : "-");
  } else if (!strcmp(cmd, "ESTOP")) {
    char *id = strtok_r(NULL, "|", &context); emergency(); prefix(F("ESTOPACK")); Serial.print('|'); Serial.println(id ? id : "-"); state();
  } else if (!strcmp(cmd, "PING")) {
    char *id = strtok_r(NULL, "|", &context); prefix(F("PONG")); Serial.print('|'); Serial.println(id ? id : "-");
  } else if (!strcmp(cmd, "STATE")) state();
}

void readSerial() {
  while (Serial.available()) {
    char value = Serial.read(); if (value == '\r') continue;
    if (value == '\n') { buffer[bufferLength] = '\0'; if (bufferLength) command(buffer); bufferLength = 0; }
    else if (bufferLength < sizeof(buffer) - 1) buffer[bufferLength++] = value; else bufferLength = 0;
  }
}
void readCard() {
  if (millis() - lastInputChange < 40) return; bool current = digitalRead(CARD_INPUT_PIN);
  if (current != previousCardInput) {
    previousCardInput = current; lastInputChange = millis(); setCard(current == LOW, "physical_card");
    prefix(F("CARD")); Serial.print('|'); Serial.println(cardPresent); state();
  }
}
void policy() {
  updateCardLed();
  if (shutdownPending && millis() - shutdownStarted >= (unsigned long)cfg.delaySeconds * 1000UL) {
    shutdownPending = false; applyMask(outputMask() & cfg.essential); setCause("card_timeout"); sequence++; updateCardLed(true); save(); state();
  }
  if (linkOnline && millis() - lastHostContact > 15000UL) { linkOnline = false; setCause("connection_loss"); sequence++; save(); state(); }
}
void setup() {
  pinMode(CARD_INPUT_PIN, INPUT_PULLUP); previousCardInput = digitalRead(CARD_INPUT_PIN); load();
  for (uint8_t index = 0; index < COUNT; index++) {
    bool activeLow = (cfg.activeLow & (1 << index)) != 0; digitalWrite(cfg.pins[index], activeLow ? HIGH : LOW); pinMode(cfg.pins[index], OUTPUT); writeOutput(index);
  }
  bool cardLedActiveLow = (cfg.cardLedFlags & CARD_LED_ACTIVE_LOW) != 0;
  digitalWrite(cfg.cardLedPin, cardLedActiveLow ? HIGH : LOW); pinMode(cfg.cardLedPin, OUTPUT); updateCardLed(true);
  Serial.begin(115200); delay(900); hello(); state();
}
void loop() {
  readSerial(); readCard(); policy(); if (millis() - lastReport >= 10000UL) { lastReport = millis(); state(); }
}
