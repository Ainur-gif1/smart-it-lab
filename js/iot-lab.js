/* IoT Lab: интерфейс виртуальной платы ESP32. Правила схемы — в iot-engine.js. */
(function () {
  "use strict";
  const SIL = window.SIL;
  const E = SIL.IotEngine;
  const t = (...args) => SIL.t(...args);
  const { esc, toast, icon, formatTime, breakdownHtml, $ } = SIL.ui;

  const els = {};
  const state = {};
  let mentor = null;

  function resetState(projectId, mode) {
    const project = E.getProject(projectId);
    Object.assign(state, {
      projectId: project.id, mode,
      controller: null, modules: [], focusId: null,
      mistakes: 0, hints: 0,
      checked: false, lastCheck: null,
      simValue: project.control.initial, observed: { on: false, off: false },
      completed: false, finished: false, result: null,
      startedAt: Date.now(), endedAt: null, demo: false
    });
    if (mentor) mentor.reset();
  }

  const project = () => E.getProject(state.projectId);
  const analysis = () => E.analyze(state);
  const isExam = () => state.mode === "exam";
  const isLocked = () => state.finished;
  const hasProgress = () => Boolean(state.controller) || state.modules.length > 0 || state.mistakes > 0 || state.hints > 0;
  const elapsedSec = () => ((state.endedAt || Date.now()) - state.startedAt) / 1000;
  const showDetails = () => !isExam() || state.finished;
  const outputOn = () => state.checked && project().isOn(state.simValue);

  // ---------------- Действия ----------------
  function invalidateCheck() {
    state.checked = false;
    state.lastCheck = null;
    state.observed = { on: false, off: false };
    state.simValue = project().control.initial;
    if (!state.finished) state.result = null;
  }

  function addComponent(id) {
    if (isLocked()) return toast(t("common.locked"), "warn");
    const comp = E.byId[id];
    if (!comp) return;
    state.focusId = id;
    if (comp.kind === "controller") {
      if (state.controller) {
        toast(t(state.controller === id ? "iot.alreadyAdded" : "iot.controllerExists", { name: E.compName(id) }), "warn");
        return;
      }
      state.controller = id;
    } else {
      if (!state.controller) return toast(t("iot.needController"), "warn");
      if (state.modules.some((m) => m.id === id)) return toast(t("iot.alreadyAdded", { name: E.compName(id) }), "info");
      state.modules.push({ id, pin: null });
    }
    invalidateCheck();
    toast(t("iot.added", { name: E.compName(id) }), "ok", 1500);
    render();
  }

  function removeComponent(id) {
    if (isLocked()) return toast(t("common.locked"), "warn");
    if (id === state.controller) {
      state.controller = null;
      state.modules.forEach((m) => { m.pin = null; }); // пины зависят от контроллера
    } else {
      state.modules = state.modules.filter((m) => m.id !== id);
    }
    invalidateCheck();
    toast(t("iot.removed", { name: E.compName(id) }), "info", 1500);
    render();
  }

  function setPin(id, pin) {
    if (isLocked()) return;
    const mod = state.modules.find((m) => m.id === id);
    if (!mod) return;
    mod.pin = pin || null;
    state.focusId = id;
    invalidateCheck();
    if (mod.pin) toast(t("iot.connected", { name: E.compName(id), pin: E.pinLabel(mod.pin) }), "ok", 1500);
    render();
  }

  function checkScheme() {
    if (isLocked()) return toast(t("common.locked"), "warn");
    const a = analysis();
    if (a.ok) {
      state.checked = true;
      state.lastCheck = "ok";
      state.simValue = project().control.initial;
      observe();
      toast(t("iot.checkOk"), "ok");
    } else {
      state.checked = false;
      state.lastCheck = "fail";
      state.mistakes += 1;
      toast(t("iot.checkFail", { n: a.errors.length }), "error");
    }
    render();
    return a;
  }

  function observe() {
    if (!state.checked) return;
    if (outputOn()) state.observed.on = true;
    else state.observed.off = true;
  }

  function setSimValue(value) {
    if (!state.checked || isLocked()) return;
    state.simValue = project().control.type === "toggle" ? Boolean(value) : Number(value);
    observe();
    if (!isExam() && !state.completed && state.observed.on && state.observed.off) {
      complete();
      return;
    }
    renderSimReadout();
    renderTaskCard();
    renderMetrics();
  }

  function currentScore() {
    return E.score(analysis(), {
      simReady: state.checked, observed: state.observed, mistakes: state.mistakes, hints: state.hints
    });
  }

  function saveAttempt(score, completed) {
    if (state.demo) return;
    SIL.Progress.recordAttempt(state.projectId, {
      score: score.total, completed, mistakes: state.mistakes, hints: state.hints,
      timeSec: Math.round(elapsedSec()), mode: state.mode
    });
  }

  function complete() {
    const score = currentScore();
    state.completed = true;
    state.endedAt = Date.now();
    state.result = score;
    saveAttempt(score, true);
    toast(t("iot.done", { score: score.total }), "ok", 4500);
    render();
  }

  function finishExam() {
    if (!isExam() || state.finished) return;
    const score = currentScore();
    state.finished = true;
    state.endedAt = Date.now();
    state.result = score;
    state.completed = state.checked && state.observed.on && state.observed.off;
    saveAttempt(score, state.completed);
    render();
  }

  // ---------------- Переключение / демо ----------------
  function leaveDemo() {
    if (!state.demo) return;
    state.demo = false;
    document.dispatchEvent(new CustomEvent("sil:demo", { detail: { lab: "iot", active: false } }));
  }

  function confirmLoss() {
    return !hasProgress() || state.finished || state.completed || window.confirm(t("common.confirmRestart"));
  }

  function switchProject(id) {
    if (id === state.projectId || !confirmLoss()) return;
    leaveDemo();
    resetState(id, state.mode);
    render();
  }

  function switchMode(mode) {
    if (mode === state.mode || !confirmLoss()) return;
    leaveDemo();
    resetState(state.projectId, mode);
    toast(t("common.modeSwitched", { mode: t("common." + mode) }), "info");
    render();
  }

  function restart() {
    leaveDemo();
    resetState(state.projectId, state.mode);
    render();
  }

  function startDemo() {
    resetState("iot-light", "learn");
    state.demo = true;
    state.controller = "esp32";
    state.modules = [{ id: "light", pin: "GPIO34" }];
    render();
    document.dispatchEvent(new CustomEvent("sil:demo", { detail: { lab: "iot", active: true } }));
  }

  function exitDemo() {
    leaveDemo();
    resetState(state.projectId, state.mode);
    render();
  }

  // ---------------- Отрисовка ----------------
  function render() {
    if (!els.page) return;
    renderTabs();
    renderMode();
    renderMetrics();
    renderTaskCard();
    renderPalette();
    renderBoard();
    renderConnections();
    renderCheck();
    renderSim();
    renderReport();
    if (mentor) mentor.render();
  }

  function renderTabs() {
    els.tabs.innerHTML = E.PROJECTS.map((p) => {
      const active = p.id === state.projectId;
      const entry = SIL.Progress.get(p.id);
      const done = entry && entry.completed ? ' <span class="tab-done" aria-hidden="true">✓</span>' : "";
      return `<button type="button" class="task-tab${active ? " is-active" : ""}" aria-pressed="${active}" data-project="${p.id}">${esc(t(`iot.projects.${p.key}.title`))}${done}</button>`;
    }).join("");
  }

  function renderMode() {
    els.mode.querySelectorAll("[data-mode]").forEach((btn) => {
      const active = btn.dataset.mode === state.mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  function currentScoreText() {
    if (state.result) return String(state.result.total);
    if (isExam()) return "—";
    return String(currentScore().total);
  }

  function renderMetrics() {
    els.score.textContent = currentScoreText();
    els.mistakes.textContent = state.mistakes;
    els.hints.textContent = state.hints;
    els.time.textContent = formatTime(elapsedSec());
  }

  function renderTaskCard() {
    const p = project();
    const a = analysis();
    const show = showDetails();
    const rows = [
      { key: "controller", points: 15, met: a.controllerOk },
      { key: "components", points: 25, met: a.present.length === a.required.length },
      { key: "wiring", points: 30, met: a.wiredOk.length === a.required.length },
      { key: "stateOn", points: 15, met: state.checked && state.observed.on },
      { key: "stateOff", points: 15, met: state.checked && state.observed.off }
    ];
    const parts = [p.controller, p.sensor, p.output]
      .map((id) => `<li>${icon(id, "icon icon-sm")}<span>${esc(E.compName(id))}</span></li>`).join("");
    els.task.innerHTML = `
      <div class="task-info">
        <h2>${esc(t(`iot.projects.${p.key}.title`))}</h2>
        <p>${esc(t(`iot.projects.${p.key}.desc`))}</p>
        <p class="muted small">${esc(t("iot.components"))}:</p>
        <ul class="parts-list">${parts}</ul>
        <p class="rule"><b>${esc(t("iot.rule"))}:</b> ${esc(t(`iot.projects.${p.key}.rule`))}</p>
        <p class="mode-note ${isExam() ? "is-exam" : ""}">${esc(t(isExam() ? "common.examNote" : "common.learnNote"))}</p>
      </div>
      <div class="task-conds">
        <h3>${esc(t("common.conditions"))} <span class="muted">· ${esc(t("common.maxScore"))}: 100</span></h3>
        <ul class="cond-list">${rows.map((r) => {
          const mark = show ? (r.met ? "✓" : "○") : "•";
          return `<li class="cond${show && r.met ? " is-met" : ""}"><span class="cond-mark" aria-hidden="true">${mark}</span><span>${esc(t("iot.breakdown." + r.key))}</span><span class="cond-pts">${esc(t("common.points", { n: r.points }))}</span></li>`;
        }).join("")}</ul>
      </div>`;
  }

  function componentTags(comp) {
    if (comp.kind === "controller") return comp.wifi ? t("iot.tags.wifi") : t("iot.tags.noWifi");
    if (comp.kind === "sensor") return t("iot.tags." + comp.signal);
    return t("iot.tags.output");
  }

  function renderPalette() {
    const locked = isLocked();
    const used = new Set([state.controller, ...state.modules.map((m) => m.id)]);
    els.palette.innerHTML = ["controller", "sensor", "output"].map((kind) => {
      const cards = E.COMPONENTS.filter((c) => c.kind === kind).map((c) => `
        <div class="comp-card${used.has(c.id) ? " is-installed" : ""}${state.focusId === c.id ? " is-selected" : ""}" data-comp="${c.id}" draggable="${!locked}">
          <button type="button" class="comp-main" data-add="${c.id}" aria-label="${esc(t("iot.addTo", { name: E.compName(c.id) }))}" ${locked ? "disabled" : ""}>
            <span class="comp-icon">${icon(c.id)}</span>
            <span class="comp-text"><span class="comp-name">${esc(E.compName(c.id))}</span><span class="comp-specs">${esc(componentTags(c))}</span></span>
            <span class="btn btn-small" aria-hidden="true">${esc(t("iot.add"))}</span>
          </button>
        </div>`).join("");
      return `<div class="inv-group"><h3 class="inv-title">${esc(t("iot.groups." + kind))}</h3>${cards}</div>`;
    }).join("");
  }

  function pinHint(pin) {
    if (!showDetails() || state.controller !== "esp32") return "";
    const num = Number(pin.slice(4));
    const flags = [];
    if (E.ADC_PINS.includes(num)) flags.push("ADC");
    if (E.INPUT_ONLY.includes(num)) flags.push("input only");
    return flags.length ? ` (${flags.join(", ")})` : "";
  }

  function renderBoard() {
    if (!state.controller) {
      els.board.innerHTML = `<div class="iot-drop">${icon("esp32", "icon icon-xl")}<p>${esc(t("iot.dropHere"))}</p></div>`;
      return;
    }
    const a = analysis();
    const errorIds = new Set(showDetails() ? a.errors.map((e) => e.compId).filter(Boolean) : []);
    const pins = E.pinsFor(state.controller);
    const on = outputOn();
    const ctrl = E.byId[state.controller];
    const pinGrid = pins.map((pin) => {
      const owner = state.modules.find((m) => m.pin === pin);
      const bad = owner && errorIds.has(owner.id);
      return `<div class="pin${owner ? " is-used" : ""}${bad ? " has-issue" : ""}">
        <span class="pin-dot" aria-hidden="true"></span><span class="pin-name">${esc(E.pinLabel(pin))}</span>
        <span class="pin-owner">${owner ? esc(E.compName(owner.id)) : ""}</span></div>`;
    }).join("");

    const modules = state.modules.map((m) => {
      const comp = E.byId[m.id];
      const isOutput = comp.kind === "output" && m.id === project().output;
      const stateCls = isOutput && state.checked ? (on ? " is-on" : " is-off") : "";
      const options = pins.map((pin) =>
        `<option value="${pin}"${m.pin === pin ? " selected" : ""}>${esc(E.pinLabel(pin) + pinHint(pin))}</option>`).join("");
      return `<div class="module${errorIds.has(m.id) ? " has-issue" : ""}${stateCls}" data-module="${m.id}">
        <span class="module-icon">${icon(m.id)}</span>
        <div class="module-body">
          <span class="comp-name">${esc(E.compName(m.id))}</span>
          <label class="pin-select"><span>${esc(t("iot.pinLabel"))}</span>
            <select data-pin-for="${m.id}" ${isLocked() ? "disabled" : ""}>
              <option value="">${esc(t("iot.notConnected"))}</option>${options}
            </select></label>
        </div>
        <button type="button" class="slot-remove" data-remove="${m.id}" aria-label="${esc(t("common.removeItem", { name: E.compName(m.id) }))}" ${isLocked() ? "disabled" : ""}>×</button>
      </div>`;
    }).join("");

    els.board.innerHTML = `
      <div class="mcu mcu-${state.controller}${errorIds.has(state.controller) ? " has-issue" : ""}">
        <div class="mcu-head">
          ${icon(state.controller)}
          <span class="slot-text"><span class="comp-name">${esc(E.compName(state.controller))}</span><span class="comp-specs">${esc(componentTags(ctrl))}</span></span>
          <button type="button" class="slot-remove" data-remove="${state.controller}" aria-label="${esc(t("common.removeItem", { name: E.compName(state.controller) }))}" ${isLocked() ? "disabled" : ""}>×</button>
        </div>
        <div class="pin-grid">${pinGrid}</div>
      </div>
      <h3 class="sub-title">${esc(t("iot.modulesTitle"))}</h3>
      ${modules ? `<div class="modules">${modules}</div>` : `<p class="muted">${esc(t("iot.noModules"))}</p>`}`;
  }

  function renderConnections() {
    const wired = state.modules.filter((m) => m.pin);
    els.connections.innerHTML = wired.length
      ? `<ul class="conn-list">${wired.map((m) => `<li><span>${esc(E.compName(m.id))}</span><span class="conn-arrow" aria-hidden="true">→</span><code>${esc(E.pinLabel(m.pin))}</code></li>`).join("")}</ul>`
      : `<p class="muted">${esc(t("iot.noConnections"))}</p>`;
  }

  function renderCheck() {
    els.check.disabled = isLocked();
    els.finish.hidden = !isExam();
    els.finish.disabled = isLocked();
    const a = analysis();
    let html = "";
    if (state.lastCheck === "ok") {
      html = `<p class="result result-ok">${esc(t("iot.checkOk"))}</p>`;
      const warnings = a.issues.filter((i) => i.level === "warning");
      if (warnings.length && showDetails()) {
        html += `<ul class="issue-list">${warnings.map((w) => `<li class="issue issue-warning">${esc(E.describeIssue(w))}</li>`).join("")}</ul>`;
      }
    } else if (state.lastCheck === "fail") {
      if (!showDetails()) {
        html = `<p class="result result-err">${esc(t("iot.checkExam", { n: a.errors.length }))}</p>`;
      } else {
        html = `<p class="result result-err">${esc(t("iot.checkFail", { n: a.errors.length }))}</p>
          <ul class="issue-list">${a.issues.map((i) => `<li class="issue issue-${i.level}">${esc(E.describeIssue(i))}</li>`).join("")}</ul>`;
      }
    }
    els.checkResult.innerHTML = html;
  }

  function renderSim() {
    const p = project();
    const control = p.control;
    const label = t(`iot.projects.${p.key}.control`);
    const disabled = !state.checked || isLocked();
    const slider = els.simControl.querySelector("input");
    // Не пересоздаём ползунок, пока пользователь его двигает.
    if (!(slider && document.activeElement === slider && slider.dataset.project === p.id)) {
      if (control.type === "range") {
        els.simControl.innerHTML = `
          <label class="sim-label" for="iot-sim-input">${esc(label)}: <output id="iot-sim-value">${state.simValue} ${esc(control.unit)}</output></label>
          <input id="iot-sim-input" type="range" data-project="${p.id}" min="${control.min}" max="${control.max}" step="${control.step}" value="${state.simValue}" ${disabled ? "disabled" : ""}>`;
      } else {
        els.simControl.innerHTML = `
          <label class="switch">
            <input id="iot-sim-input" type="checkbox" role="switch" data-project="${p.id}" ${state.simValue ? "checked" : ""} ${disabled ? "disabled" : ""}>
            <span class="switch-track" aria-hidden="true"></span>
            <span>${esc(label)}: <b id="iot-sim-value">${esc(state.simValue ? t("common.yes") : t("common.no"))}</b></span>
          </label>`;
      }
    }
    renderSimReadout();
  }

  function sensorText() {
    const p = project();
    if (p.control.type === "toggle") return state.simValue ? t("iot.sim.motionYes") : t("iot.sim.motionNo");
    return `${state.simValue} ${p.control.unit}`;
  }

  function outputVisual(id, on) {
    if (id === "led") return `<span class="viz-led${on ? " is-on" : ""}" aria-hidden="true"></span>`;
    if (id === "fan") return `<span class="viz-fan${on ? " is-on" : ""}" aria-hidden="true">${icon("fan", "icon icon-lg")}</span>`;
    return `<span class="viz-buzzer${on ? " is-on" : ""}" aria-hidden="true">${icon("buzzer", "icon icon-lg")}${on ? "<b>BEEP!</b>" : ""}</span>`;
  }

  function renderSimReadout() {
    const p = project();
    const valueEl = document.getElementById("iot-sim-value");
    if (valueEl) {
      valueEl.textContent = p.control.type === "toggle"
        ? (state.simValue ? t("common.yes") : t("common.no"))
        : `${state.simValue} ${p.control.unit}`;
    }
    if (!state.checked) {
      els.simReadout.innerHTML = `<p class="muted">${esc(t("iot.sim.locked"))}</p>`;
      return;
    }
    const on = outputOn();
    const pinOf = (id) => {
      const mod = state.modules.find((m) => m.id === id);
      return mod && mod.pin ? mod.pin.replace("GPIO", "") : "?";
    };
    const code = p.code({ sensor: pinOf(p.sensor), output: pinOf(p.output) });
    const activeLine = on ? 6 : 8;
    const act = E.compName(p.output);
    els.simReadout.innerHTML = `
      <div class="readings">
        <div class="reading"><span class="muted small">${esc(t("iot.sim.sensor"))}</span><strong>${esc(sensorText())}</strong></div>
        <div class="reading reading-output${on ? " is-on" : ""}">
          ${outputVisual(p.output, on)}
          <span><span class="muted small">${esc(t("iot.sim.output"))}</span><strong>${esc(act)}: ${on ? "ON" : "OFF"}</strong></span>
        </div>
      </div>
      <p class="small">${esc(t("iot.sim.goal", { act }))}
        <span class="seen${state.observed.on ? " is-met" : ""}">${state.observed.on ? "✓" : "○"} ${esc(t("iot.sim.seenOn"))}</span>
        <span class="seen${state.observed.off ? " is-met" : ""}">${state.observed.off ? "✓" : "○"} ${esc(t("iot.sim.seenOff"))}</span></p>
      <details class="code-box" open>
        <summary>${esc(t("iot.sim.code"))}</summary>
        <pre><code>${code.map((line, i) => `<span class="code-line${i === activeLine ? " is-active" : ""}">${esc(line) || " "}</span>`).join("\n")}</code></pre>
      </details>`;
    const module = els.board.querySelector(`[data-module="${p.output}"]`);
    if (module) {
      module.classList.toggle("is-on", on);
      module.classList.toggle("is-off", !on);
    }
  }

  function renderReport() {
    if (!state.result) {
      els.report.innerHTML = "";
      return;
    }
    let html = `<h3 class="result-title">${esc(t("common.resultTitle"))}</h3>`;
    html += state.completed
      ? `<p class="result result-ok big">${esc(t("common.taskDone"))}</p>`
      : `<p class="result result-err">${esc(t("common.taskNotDone"))}</p>`;
    const a = analysis();
    if (state.finished && a.issues.length) {
      html += `<ul class="issue-list">${a.issues.map((i) => `<li class="issue issue-${i.level}">${esc(E.describeIssue(i))}</li>`).join("")}</ul>`;
    }
    html += breakdownHtml(state.result, "iot.breakdown.");
    html += `<p class="muted small">${esc(t(state.demo ? "common.demoNotSaved" : "common.saved"))}</p>`;
    if (state.finished) html += `<p class="muted small">${esc(t("common.locked"))}</p>`;
    els.report.innerHTML = html;
  }

  function tickTimer() {
    if (els.page && !els.page.hidden && !state.endedAt) els.time.textContent = formatTime(elapsedSec());
  }

  // ---------------- События ----------------
  function bindEvents() {
    els.tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-project]");
      if (btn) switchProject(btn.dataset.project);
    });
    els.mode.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (btn) switchMode(btn.dataset.mode);
    });
    $("#iot-restart").addEventListener("click", () => {
      if (confirmLoss()) restart();
    });
    els.palette.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add]");
      if (btn) addComponent(btn.dataset.add);
    });
    els.board.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove]");
      if (btn) removeComponent(btn.dataset.remove);
    });
    els.board.addEventListener("change", (e) => {
      const select = e.target.closest("[data-pin-for]");
      if (select) setPin(select.dataset.pinFor, select.value);
    });
    els.check.addEventListener("click", checkScheme);
    els.finish.addEventListener("click", finishExam);
    els.simControl.addEventListener("input", (e) => {
      if (e.target.type === "range") setSimValue(e.target.value);
    });
    els.simControl.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") setSimValue(e.target.checked);
      else if (e.target.type === "range") renderSim();
    });

    // Drag & Drop: перетаскивание компонента на плату (дополнительно к кнопкам).
    els.palette.addEventListener("dragstart", (e) => {
      const card = e.target.closest("[data-comp]");
      if (!card || isLocked()) return;
      e.dataTransfer.setData("text/plain", card.dataset.comp);
      e.dataTransfer.effectAllowed = "copy";
    });
    els.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      els.dropZone.classList.add("is-dragover");
    });
    els.dropZone.addEventListener("dragleave", (e) => {
      if (!els.dropZone.contains(e.relatedTarget)) els.dropZone.classList.remove("is-dragover");
    });
    els.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.dropZone.classList.remove("is-dragover");
      const id = e.dataTransfer.getData("text/plain");
      if (E.byId[id]) addComponent(id);
    });
  }

  function init() {
    els.page = document.querySelector('[data-page="iot"]');
    if (!els.page) return;
    els.tabs = $("#iot-project-tabs");
    els.mode = $("#iot-mode");
    els.score = $("#iot-m-score");
    els.mistakes = $("#iot-m-mistakes");
    els.hints = $("#iot-m-hints");
    els.time = $("#iot-m-time");
    els.task = $("#iot-task-card");
    els.palette = $("#iot-palette");
    els.board = $("#iot-board");
    els.dropZone = $("#iot-board-panel");
    els.connections = $("#iot-connections");
    els.check = $("#iot-check");
    els.finish = $("#iot-finish");
    els.checkResult = $("#iot-check-result");
    els.simControl = $("#iot-sim-control");
    els.simReadout = $("#iot-sim-readout");
    els.report = $("#iot-report");

    resetState("iot-light", "learn");
    bindEvents();

    mentor = SIL.Mentor.create({
      lab: "iot",
      container: $("#iot-mentor"),
      isExamRunning: () => isExam() && !state.finished,
      onHint: () => {
        if (state.finished || state.completed) return;
        state.hints += 1;
        renderMetrics();
      },
      getContext: () => ({
        analysis: analysis(),
        controller: state.controller,
        modules: state.modules.map((m) => Object.assign({}, m)),
        checked: state.checked,
        observed: Object.assign({}, state.observed),
        focusId: state.focusId
      })
    });

    document.addEventListener("sil:lang", render);
    document.addEventListener("sil:progress", renderTabs);
    setInterval(tickTimer, 1000);
    render();
  }

  function getLiveSummary() {
    const p = project();
    return {
      lab: "iot", taskId: p.id, titleKey: `iot.projects.${p.key}.title`, mode: state.mode,
      score: currentScoreText(), mistakes: state.mistakes, hints: state.hints,
      active: hasProgress() && !state.finished && !state.completed && !state.demo
    };
  }

  SIL.IotLab = {
    init, render, addComponent, removeComponent, setPin, checkScheme, setSimValue, finishExam,
    switchProject, switchMode, restart, startDemo, exitDemo, getLiveSummary,
    get state() { return state; },
    get mentor() { return mentor; }
  };
})();
