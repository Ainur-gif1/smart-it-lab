/*
 * IoT Lab: компоненты, проекты и правила проверки схемы.
 * Упрощённая учебная модель ESP32 — без DOM, только логика.
 */
(function (root) {
  "use strict";
  const SIL = (root.SIL = root.SIL || {});
  const t = (...args) => SIL.t(...args);

  const ESP32_PINS = [2, 4, 5, 12, 13, 14, 25, 26, 27, 32, 33, 34, 35].map((n) => "GPIO" + n);
  const ARDUINO_PINS = ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "A0", "A1"];
  const INPUT_ONLY = [34, 35, 36, 39]; // у ESP32 нет выходного драйвера на этих GPIO
  const ADC_PINS = [32, 33, 34, 35, 36, 39]; // ADC1 — аналоговые входы

  const COMPONENTS = [
    { id: "esp32", kind: "controller", wifi: true },
    { id: "arduino", kind: "controller", wifi: false },
    { id: "dht22", kind: "sensor", signal: "digital" },
    { id: "light", kind: "sensor", signal: "analog" },
    { id: "pir", kind: "sensor", signal: "digital" },
    { id: "led", kind: "output" },
    { id: "buzzer", kind: "output" },
    { id: "relay", kind: "output" },
    { id: "fan", kind: "output" }
  ];
  const byId = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]));

  const RECOMMENDED_PINS = {
    light: { pin: "GPIO34", reason: "analog" },
    dht22: { pin: "GPIO4", reason: "digitalIn" },
    pir: { pin: "GPIO14", reason: "digitalIn" },
    led: { pin: "GPIO12", reason: "output" },
    fan: { pin: "GPIO26", reason: "output" },
    buzzer: { pin: "GPIO25", reason: "output" },
    relay: { pin: "GPIO27", reason: "output" }
  };

  const PROJECTS = [
    {
      id: "iot-light", key: "light", controller: "esp32", sensor: "light", output: "led",
      control: { type: "range", min: 0, max: 1000, step: 10, initial: 600, unit: "лк" },
      isOn: (value) => value < 300,
      code: (p) => [
        `const int LIGHT_PIN = ${p.sensor};`,
        `const int LED_PIN = ${p.output};`,
        "",
        "void loop() {",
        "  int light = readLight(LIGHT_PIN); // 0–1000",
        "  if (light < 300) {",
        "    digitalWrite(LED_PIN, HIGH);",
        "  } else {",
        "    digitalWrite(LED_PIN, LOW);",
        "  }",
        "}"
      ]
    },
    {
      id: "iot-temp", key: "temp", controller: "esp32", sensor: "dht22", output: "fan",
      control: { type: "range", min: 10, max: 45, step: 1, initial: 24, unit: "°C" },
      isOn: (value) => value > 28,
      code: (p) => [
        `DHT dht(${p.sensor}, DHT22);`,
        `const int FAN_PIN = ${p.output};`,
        "",
        "void loop() {",
        "  float temp = dht.readTemperature();",
        "  if (temp > 28) {",
        "    digitalWrite(FAN_PIN, HIGH);",
        "  } else {",
        "    digitalWrite(FAN_PIN, LOW);",
        "  }",
        "}"
      ]
    },
    {
      id: "iot-motion", key: "motion", controller: "esp32", sensor: "pir", output: "buzzer",
      control: { type: "toggle", initial: false },
      isOn: (value) => value === true,
      code: (p) => [
        `const int PIR_PIN = ${p.sensor};`,
        `const int BUZZER_PIN = ${p.output};`,
        "",
        "void loop() {",
        "  bool motion = digitalRead(PIR_PIN);",
        "  if (motion == HIGH) {",
        "    digitalWrite(BUZZER_PIN, HIGH);",
        "  } else {",
        "    digitalWrite(BUZZER_PIN, LOW);",
        "  }",
        "}"
      ]
    }
  ];

  const getProject = (id) => PROJECTS.find((p) => p.id === id) || PROJECTS[0];
  const pinsFor = (controllerId) => (controllerId === "arduino" ? ARDUINO_PINS : controllerId ? ESP32_PINS : []);
  const pinLabel = (pin) => (pin && pin.startsWith("GPIO") ? "GPIO " + pin.slice(4) : pin || "");
  const pinNumber = (pin) => (pin && pin.startsWith("GPIO") ? Number(pin.slice(4)) : NaN);
  const compName = (id) => t("iot.comp." + id);

  /** state: { projectId, controller, modules: [{ id, pin }] } */
  function analyze(state) {
    const project = getProject(state.projectId);
    const modules = state.modules || [];
    const issues = [];
    const required = [project.sensor, project.output];
    let controllerOk = false;

    if (!state.controller) {
      issues.push({ level: "error", code: "noController", compId: null });
    } else if (state.controller !== project.controller) {
      issues.push({ level: "error", code: "wrongController", compId: state.controller });
    } else {
      controllerOk = true;
    }

    required.forEach((id) => {
      const mod = modules.find((m) => m.id === id);
      if (!mod) issues.push({ level: "error", code: "missing", compId: id });
      else if (!mod.pin) issues.push({ level: "error", code: "notWired", compId: id });
    });

    const pinOwner = {};
    modules.forEach((mod) => {
      if (!mod.pin) return;
      const comp = byId[mod.id];
      const num = pinNumber(mod.pin);
      if (state.controller === "esp32") {
        if (comp.kind === "output" && INPUT_ONLY.includes(num)) {
          issues.push({ level: "error", code: "inputOnly", compId: mod.id, pin: mod.pin });
        }
        if (comp.signal === "analog" && !ADC_PINS.includes(num)) {
          issues.push({ level: "error", code: "needAdc", compId: mod.id, pin: mod.pin });
        }
      }
      if (pinOwner[mod.pin]) {
        issues.push({ level: "error", code: "dupPin", compId: mod.id, otherId: pinOwner[mod.pin], pin: mod.pin });
      } else {
        pinOwner[mod.pin] = mod.id;
      }
    });

    modules.filter((m) => !required.includes(m.id)).forEach((m) => {
      issues.push({ level: "warning", code: "extra", compId: m.id });
    });

    const errors = issues.filter((i) => i.level === "error");
    const present = required.filter((id) => modules.some((m) => m.id === id));
    const wiredOk = required.filter((id) => {
      const mod = modules.find((m) => m.id === id);
      return mod && mod.pin && !errors.some((e) => e.compId === id);
    });
    return { project, issues, errors, ok: errors.length === 0, controllerOk, required, present, wiredOk };
  }

  /** Максимум 100: контроллер 15, компоненты 25, GPIO 30, состояния ON/OFF по 15. */
  function score(analysis, { simReady = false, observed = {}, mistakes = 0, hints = 0 } = {}) {
    const total = analysis.required.length;
    const parts = [
      { key: "controller", max: 15, points: analysis.controllerOk ? 15 : 0 },
      { key: "components", max: 25, points: Math.round((25 * analysis.present.length) / total) },
      { key: "wiring", max: 30, points: Math.round((30 * analysis.wiredOk.length) / total) },
      { key: "stateOn", max: 15, points: simReady && observed.on ? 15 : 0 },
      { key: "stateOff", max: 15, points: simReady && observed.off ? 15 : 0 }
    ];
    const gained = parts.reduce((s, p) => s + p.points, 0);
    const penalty = mistakes * 5 + hints * 3;
    return { parts, gained, penalty, mistakes, hints, total: Math.max(0, Math.min(100, gained - penalty)), max: 100 };
  }

  function issueParams(issue) {
    return {
      name: issue.compId ? compName(issue.compId) : "",
      other: issue.otherId ? compName(issue.otherId) : "",
      pin: pinLabel(issue.pin)
    };
  }
  const describeIssue = (issue) => t("iot.issue." + issue.code, issueParams(issue));
  const describeFix = (issue) => t("iot.fix." + issue.code, issueParams(issue));

  SIL.IotEngine = {
    COMPONENTS, PROJECTS, RECOMMENDED_PINS, INPUT_ONLY, ADC_PINS,
    byId, getProject, pinsFor, pinLabel, compName, analyze, score, describeIssue, describeFix
  };
})(typeof window !== "undefined" ? window : globalThis);
