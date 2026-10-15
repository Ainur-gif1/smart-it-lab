/* PC Builder: интерфейс симулятора сборки ПК. Правила совместимости — в pc-engine.js. */
(function () {
  "use strict";
  const SIL = window.SIL;
  const E = SIL.PcEngine;
  const t = (...args) => SIL.t(...args);
  const { esc, toast, icon, formatTime, breakdownHtml, wait, $ } = SIL.ui;

  const BOOT_STEP_MS = 280;
  const BOARD_SLOTS = ["cpu", "cooler", "ram", "gpu", "storage"];
  const els = {};
  const state = {};
  let mentor = null;
  let bootToken = 0;

  function resetState(taskId, mode) {
    bootToken += 1; // прерывает незавершённую анимацию POST
    Object.assign(state, {
      taskId, mode,
      build: {}, selectedId: null, focusId: null,
      mistakes: 0, hints: 0,
      startedAt: Date.now(), endedAt: null,
      finished: false, booting: false, demo: false,
      panelView: null, launchResult: null, consoleLines: []
    });
    if (mentor) mentor.reset();
  }

  const analysis = () => E.analyze(state.build, state.taskId);
  const isExam = () => state.mode === "exam";
  const isLocked = () => state.finished || state.booting;
  const hasProgress = () => Object.keys(state.build).length > 0 || state.mistakes > 0 || state.hints > 0;
  const elapsedSec = () => ((state.endedAt || Date.now()) - state.startedAt) / 1000;
  const slotName = (slot) => t("pc.slots." + slot);

  // ---------------- Действия ----------------
  function select(compId) {
    if (isLocked()) return toast(t("common.locked"), "warn");
    state.selectedId = state.selectedId === compId ? null : compId;
    if (state.selectedId) state.focusId = compId;
    renderInventory();
    renderCase();
    renderHint();
  }

  function install(compId, targetSlot) {
    if (isLocked()) {
      toast(t("common.locked"), "warn");
      return false;
    }
    const comp = E.byId[compId];
    if (!comp) return false;
    if (targetSlot && targetSlot !== comp.slot) {
      toast(t("pc.wrongSlot", { name: comp.name, slot: slotName(comp.slot) }), "warn");
      return false;
    }
    if (E.MOUNTED_ON_BOARD.includes(comp.slot) && !state.build.motherboard) {
      toast(t("pc.needBoard", { slot: slotName(comp.slot) }), "warn");
      return false;
    }
    if (comp.slot === "cooler" && !state.build.cpu) {
      toast(t("pc.needCpu"), "warn");
      return false;
    }

    const before = E.compatProblemCodes(state.build, state.taskId);
    state.build[comp.slot] = comp.id;
    const after = E.compatProblemCodes(state.build, state.taskId);
    state.selectedId = null;
    state.focusId = comp.id;
    clearResults();

    const createdProblem = [...after].some((code) => !before.has(code));
    if (createdProblem) state.mistakes += 1; // «ошибочная установка» — штраф в обоих режимах
    if (createdProblem && !isExam()) toast(t("pc.badInstall"), "error", 4500);
    else toast(t("pc.installed", { name: comp.name }), "ok", 1600);
    render();
    return true;
  }

  function remove(slot) {
    if (isLocked()) return toast(t("common.locked"), "warn");
    const comp = E.byId[state.build[slot]];
    if (!comp) return;
    delete state.build[slot];
    if (slot === "motherboard") {
      E.MOUNTED_ON_BOARD.forEach((s) => delete state.build[s]);
      toast(t("pc.removedWithBoard"), "info");
    } else {
      if (slot === "cpu") delete state.build.cooler;
      toast(t("pc.removed", { name: comp.name }), "info", 1600);
    }
    clearResults();
    render();
  }

  function clearResults() {
    state.panelView = null;
    state.launchResult = null;
    state.consoleLines = [];
  }

  function check() {
    if (isLocked()) return toast(t("common.locked"), "warn");
    state.panelView = "check";
    renderPanel();
    return analysis();
  }

  function bootSteps(a) {
    const b = a.build;
    if (!b.psu) return [{ text: "No power: PSU not installed", cls: "err" }, { text: "POST FAILED", cls: "err big" }];
    const line = (ok, okText, errText) => (ok ? { text: okText, cls: "ok" } : { text: errText, cls: "err" });
    const steps = [{ text: "Power ON", cls: "ok" }];
    if (!a.power.enough) steps.push({ text: `Power warning: ~${a.power.required} W, PSU ${a.power.psu} W`, cls: "err" });
    steps.push(line(b.cpu && a.compat.socket, `CPU detected: ${b.cpu && b.cpu.name}`, b.cpu ? "CPU socket mismatch" : "CPU not found"));
    steps.push(line(b.cooler && a.compat.cooler, "CPU fan OK", b.cooler ? "CPU overheat warning" : "CPU fan not found"));
    steps.push(line(b.ram && a.compat.ram, `RAM detected: ${b.ram && b.ram.name}`, b.ram ? "RAM type mismatch" : "RAM not found"));
    if (b.gpu) steps.push({ text: `GPU detected: ${b.gpu.name}`, cls: "ok" });
    else steps.push(line(b.cpu && b.cpu.igpu, "GPU: integrated graphics", "No video output"));
    steps.push(line(b.storage, `SSD detected: ${b.storage && b.storage.name}`, "No boot device"));
    steps.push(a.postOk ? { text: "POST successful", cls: "ok big" } : { text: "POST FAILED", cls: "err big" });
    return steps;
  }

  async function launch() {
    if (isLocked()) {
      toast(t("common.locked"), "warn");
      return null;
    }
    const a = analysis();
    const token = ++bootToken;
    state.booting = true;
    state.panelView = "boot";
    state.launchResult = null;
    state.consoleLines = [];
    render();

    for (const step of bootSteps(a)) {
      await wait(BOOT_STEP_MS);
      if (token !== bootToken) return null; // задание сменили во время загрузки
      state.consoleLines.push(step);
      renderConsole();
    }
    return finishLaunch(a);
  }

  function finishLaunch(a) {
    state.booting = false;
    if (!a.postOk) state.mistakes += 1;
    const score = E.score(a, { launched: true, mistakes: state.mistakes, hints: state.hints });
    if (a.postOk || isExam()) state.endedAt = Date.now();
    if (isExam()) state.finished = true;
    state.launchResult = { postOk: a.postOk, taskOk: a.taskOk, score };
    state.panelView = "launch";
    if (!state.demo) {
      SIL.Progress.recordAttempt(state.taskId, {
        score: score.total, completed: a.taskOk, mistakes: state.mistakes, hints: state.hints,
        timeSec: Math.round(elapsedSec()), mode: state.mode
      });
    }
    toast(a.postOk ? t("pc.success") : t("pc.postFailed"), a.postOk ? "ok" : "error");
    render();
    return state.launchResult;
  }

  // ---------------- Переключение задания / режима / демо ----------------
  function leaveDemo() {
    if (!state.demo) return;
    state.demo = false;
    document.dispatchEvent(new CustomEvent("sil:demo", { detail: { lab: "pc", active: false } }));
  }

  function confirmLoss() {
    return !hasProgress() || state.finished || window.confirm(t("common.confirmRestart"));
  }

  function switchTask(taskId) {
    if (taskId === state.taskId || !confirmLoss()) return;
    leaveDemo();
    resetState(taskId, state.mode);
    render();
  }

  function switchMode(mode) {
    if (mode === state.mode || !confirmLoss()) return;
    leaveDemo();
    resetState(state.taskId, mode);
    toast(t("common.modeSwitched", { mode: t("common." + mode) }), "info");
    render();
  }

  function restart() {
    leaveDemo();
    resetState(state.taskId, state.mode);
    render();
  }

  function startDemo() {
    resetState("pc-gaming", "learn");
    state.demo = true;
    state.build = { motherboard: "mb-a", cpu: "cpu-r7", ram: "ram-16", storage: "ssd-1tb" };
    render();
    document.dispatchEvent(new CustomEvent("sil:demo", { detail: { lab: "pc", active: true } }));
  }

  function exitDemo() {
    leaveDemo();
    resetState(state.taskId, state.mode);
    render();
  }

  // ---------------- Отрисовка ----------------
  function render() {
    if (!els.page) return;
    renderTabs();
    renderMode();
    renderMetrics();
    renderTaskCard();
    renderHint();
    renderInventory();
    renderCase();
    renderMeters();
    renderButtons();
    renderPanel();
    if (mentor) mentor.render();
  }

  function renderTabs() {
    els.tabs.innerHTML = E.TASKS.map((task) => {
      const active = task.id === state.taskId;
      const entry = SIL.Progress.get(task.id);
      const done = entry && entry.completed ? ' <span class="tab-done" aria-hidden="true">✓</span>' : "";
      return `<button type="button" class="task-tab${active ? " is-active" : ""}" aria-pressed="${active}" data-task="${task.id}">${esc(t(`pc.tasks.${task.key}.title`))}${done}</button>`;
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
    if (state.launchResult) return String(state.launchResult.score.total);
    if (isExam()) return "—";
    return String(E.score(analysis(), { mistakes: state.mistakes, hints: state.hints }).total);
  }

  function renderMetrics() {
    els.score.textContent = currentScoreText();
    els.mistakes.textContent = state.mistakes;
    els.hints.textContent = state.hints;
    els.time.textContent = formatTime(elapsedSec());
  }

  function renderTaskCard() {
    const a = analysis();
    const task = a.task;
    const showStatus = !isExam() || state.finished;
    const launchOk = Boolean(state.launchResult && state.launchResult.postOk);
    const rows = [
      { label: t("pc.breakdown.required"), points: 20, met: a.allRequired },
      { label: t("pc.breakdown.socket"), points: 10, met: a.compat.socket },
      { label: t("pc.breakdown.ram"), points: 8, met: a.compat.ram },
      { label: t("pc.breakdown.cooler"), points: 7, met: a.compat.cooler },
      { label: t("pc.breakdown.power"), points: 15, met: a.power.enough },
      ...a.conditions.map((c) => ({ label: t(c.key), points: c.points, met: c.met, special: true })),
      { label: t("pc.breakdown.launch"), points: 20, met: launchOk }
    ];
    els.task.innerHTML = `
      <div class="task-info">
        <h2>${esc(t(`pc.tasks.${task.key}.title`))}</h2>
        <p>${esc(t(`pc.tasks.${task.key}.desc`))}</p>
        <p class="mode-note ${isExam() ? "is-exam" : ""}">${esc(t(isExam() ? "common.examNote" : "common.learnNote"))}</p>
      </div>
      <div class="task-conds">
        <h3>${esc(t("common.conditions"))} <span class="muted">· ${esc(t("common.maxScore"))}: 100</span></h3>
        <ul class="cond-list">${rows.map((r) => {
          const mark = showStatus ? (r.met ? "✓" : "○") : "•";
          const cls = showStatus && r.met ? " is-met" : "";
          return `<li class="cond${cls}${r.special ? " is-special" : ""}"><span class="cond-mark" aria-hidden="true">${mark}</span><span>${esc(r.label)}</span><span class="cond-pts">${esc(t("common.points", { n: r.points }))}</span></li>`;
        }).join("")}</ul>
      </div>`;
  }

  function renderHint() {
    const comp = state.selectedId ? E.byId[state.selectedId] : null;
    els.hint.textContent = comp ? t("pc.selected", { name: comp.name, slot: slotName(comp.slot) }) : t("pc.hint");
    els.hint.classList.toggle("is-active", Boolean(comp));
  }

  function renderInventory() {
    const locked = isLocked();
    els.inventory.innerHTML = E.SLOTS.map((slot) => {
      const cards = E.COMPONENTS.filter((c) => c.slot === slot).map((c) => {
        const selected = state.selectedId === c.id;
        const installed = state.build[c.slot] === c.id;
        return `<div class="comp-card${selected ? " is-selected" : ""}${installed ? " is-installed" : ""}" data-comp="${c.id}" draggable="${!locked}">
          <button type="button" class="comp-main" data-action="select" data-id="${c.id}" aria-pressed="${selected}" ${locked ? "disabled" : ""}>
            <span class="comp-icon">${icon(c.slot)}</span>
            <span class="comp-text">
              <span class="comp-name">${esc(c.name)}${installed ? ` <span class="badge">${esc(t("pc.installedBadge"))}</span>` : ""}</span>
              <span class="comp-specs">${esc(E.specList(c).join(" · "))}</span>
            </span>
          </button>
          <button type="button" class="btn btn-small comp-install" data-action="install" data-id="${c.id}"
            aria-label="${esc(t("pc.installTo", { name: c.name, slot: slotName(c.slot) }))}" ${locked || installed ? "disabled" : ""}>${esc(t("pc.install"))}</button>
        </div>`;
      }).join("");
      return `<div class="inv-group" data-group="${slot}"><h3 class="inv-title">${esc(slotName(slot))}</h3>${cards}</div>`;
    }).join("");
  }

  function slotHtml(slot, issueSlots, target) {
    const comp = E.byId[state.build[slot]];
    const label = slotName(slot) + (slot === "gpu" ? ` (${t("pc.optional")})` : "");
    const classes = ["slot", "slot-" + slot];
    if (comp) classes.push("is-filled");
    if (target === slot) classes.push("is-target");
    if (issueSlots.has(slot)) classes.push("has-issue");
    const value = comp ? esc(comp.name) : esc(t("pc.emptySlot"));
    return `<div class="${classes.join(" ")}" data-slot="${slot}">
      <button type="button" class="slot-main" data-slot-action="slot" data-slot-name="${slot}"
        aria-label="${esc(label)}: ${value}">
        <span class="slot-icon">${icon(slot)}</span>
        <span class="slot-text"><span class="slot-label">${esc(label)}</span><span class="slot-value">${value}</span></span>
      </button>
      ${comp ? `<button type="button" class="slot-remove" data-slot-action="remove" data-slot-name="${slot}" aria-label="${esc(t("common.removeItem", { name: comp.name }))}">×</button>` : ""}
    </div>`;
  }

  function renderCase() {
    const a = analysis();
    const issueSlots = new Set();
    if (!isExam() || state.finished) {
      a.issues.filter((i) => i.code !== "missing").forEach((i) => i.slots.forEach((s) => issueSlots.add(s)));
    }
    const selected = state.selectedId ? E.byId[state.selectedId] : null;
    const target = selected ? selected.slot : null;
    const board = E.byId[state.build.motherboard];
    let html;
    if (!board) {
      html = slotHtml("motherboard", issueSlots, target).replace('class="slot ', 'class="slot slot-board-empty ')
        .replace(`<span class="slot-value">${esc(t("pc.emptySlot"))}</span>`, `<span class="slot-value">${esc(t("pc.boardPlaceholder"))}</span>`);
    } else {
      const boardCls = ["board"];
      if (target === "motherboard") boardCls.push("is-target");
      if (issueSlots.has("motherboard")) boardCls.push("has-issue");
      html = `<div class="${boardCls.join(" ")}" data-slot="motherboard">
        <div class="board-head">
          <button type="button" class="board-main" data-slot-action="slot" data-slot-name="motherboard"
            aria-label="${esc(slotName("motherboard"))}: ${esc(board.name)}">
            ${icon("motherboard")}
            <span class="slot-text"><span class="slot-label">${esc(slotName("motherboard"))}</span>
            <span class="slot-value">${esc(board.name)} · ${esc(board.socket)} · ${esc(board.ramType)}</span></span>
          </button>
          <button type="button" class="slot-remove" data-slot-action="remove" data-slot-name="motherboard" aria-label="${esc(t("common.removeItem", { name: board.name }))}">×</button>
        </div>
        <div class="board-grid">${BOARD_SLOTS.map((s) => slotHtml(s, issueSlots, target)).join("")}</div>
      </div>`;
    }
    html += slotHtml("psu", issueSlots, target);
    els.case.innerHTML = html;
    els.case.classList.toggle("is-powered", Boolean(state.launchResult && state.launchResult.postOk));
  }

  function renderMeters() {
    const a = analysis();
    const p = a.power;
    const pct = p.psu ? Math.min(100, Math.round((p.minWatt / p.psu) * 100)) : 0;
    const neutral = (isExam() && !state.finished) || !p.psu;
    const barCls = neutral ? "neutral" : p.enough ? "ok" : "err";
    const budget = a.task.budget;
    const overBudget = budget && a.price > budget && !(isExam() && !state.finished);
    els.meters.innerHTML = `
      <div class="meter">
        <div class="meter-row"><span>${esc(t("pc.powerLabel"))}</span>
          <span>${esc(t("pc.powerValue", { req: p.required, psu: p.psu ? p.psu + " W" : t("pc.noPsu") }))}</span></div>
        <div class="bar" role="img" aria-label="${pct}%"><span class="bar-fill ${barCls}" style="width:${pct}%"></span></div>
      </div>
      <div class="meter-row"><span>${esc(t("pc.priceLabel"))}</span>
        <span class="${overBudget ? "text-err" : ""}">$${a.price}${budget ? ` / ${esc(t("pc.budgetLabel"))} $${budget}` : ""}</span></div>`;
  }

  function renderButtons() {
    const locked = isLocked();
    els.check.disabled = locked;
    els.launch.disabled = locked;
    els.launch.textContent = isExam() ? t("pc.launchExam") : t("pc.launch");
  }

  function renderConsole() {
    if (!state.consoleLines.length) {
      els.console.innerHTML = `<div class="console-line muted">${esc(t("pc.consoleIdle"))}</div>`;
      return;
    }
    els.console.innerHTML = state.consoleLines
      .map((line) => `<div class="console-line ${line.cls}">&gt; ${esc(line.text)}</div>`).join("");
    els.console.scrollTop = els.console.scrollHeight;
  }

  const issueList = (issues) => `<ul class="issue-list">${issues
    .map((i) => `<li class="issue issue-${i.level}">${esc(E.describeIssue(i))}</li>`).join("")}</ul>`;

  function unmetList(a) {
    const unmet = a.conditions.filter((c) => !c.met);
    if (!unmet.length) return "";
    return `<ul class="issue-list">${unmet.map((c) => `<li class="issue issue-warning">${esc(t(c.key))}</li>`).join("")}</ul>`;
  }

  function renderPanel() {
    renderConsole();
    const a = analysis();
    let html = "";
    if (state.panelView === "check") {
      if (isExam() && !state.finished) {
        html = a.errors.length
          ? `<p class="result result-err">${esc(t("pc.checkExam", { n: a.errors.length }))}</p>`
          : `<p class="result result-ok">${esc(t("pc.checkExamOk"))}</p>`;
      } else if (a.errors.length) {
        html = `<p class="result result-err">${esc(t("common.issuesFound", { n: a.errors.length }))}</p>${issueList(a.errors)}`;
      } else {
        html = `<p class="result result-ok">${esc(t("pc.checkOk"))}</p>`;
        if (!a.taskOk) html += `<p class="result result-warn">${esc(t("common.taskNotDone"))}</p>${unmetList(a)}`;
      }
    } else if (state.panelView === "launch" && state.launchResult) {
      const r = state.launchResult;
      html = `<h3 class="result-title">${esc(t("common.resultTitle"))}</h3>`;
      html += r.postOk
        ? `<p class="result result-ok big">${esc(t("pc.success"))}</p>`
        : `<p class="result result-err big">${esc(t("pc.postFailed"))}</p>${issueList(a.errors)}`;
      if (r.postOk) {
        html += r.taskOk
          ? `<p class="result result-ok">${esc(t("common.taskDone"))}</p>`
          : `<p class="result result-warn">${esc(t("common.taskNotDone"))}</p>${unmetList(a)}`;
      }
      html += breakdownHtml(r.score, "pc.breakdown.");
      html += `<p class="muted small">${esc(t(state.demo ? "common.demoNotSaved" : "common.saved"))}</p>`;
      if (state.finished) html += `<p class="muted small">${esc(t("common.locked"))}</p>`;
    }
    els.report.innerHTML = html;
  }

  function tickTimer() {
    if (els.page && !els.page.hidden && !state.endedAt) {
      els.time.textContent = formatTime(elapsedSec());
    }
  }

  // ---------------- События ----------------
  function onCaseClick(event) {
    const button = event.target.closest("[data-slot-action]");
    if (!button) return;
    const slot = button.dataset.slotName;
    if (button.dataset.slotAction === "remove") {
      remove(slot);
      return;
    }
    if (state.selectedId) {
      install(state.selectedId, slot === "motherboard" ? null : slot);
      return;
    }
    const installed = E.byId[state.build[slot]];
    if (installed) {
      state.focusId = installed.id;
      toast(t("pc.slotInfo", { slot: slotName(slot), name: installed.name }), "info");
      return;
    }
    toast(t("pc.pickFor", { slot: slotName(slot) }), "info");
    const first = els.inventory.querySelector(`[data-group="${slot}"] [data-action="select"]`);
    if (first) {
      first.scrollIntoView({ block: "nearest", behavior: "smooth" });
      first.focus({ preventScroll: true });
    }
  }

  function bindDragAndDrop() {
    els.inventory.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-comp]");
      if (!card || isLocked()) return;
      event.dataTransfer.setData("text/plain", card.dataset.comp);
      event.dataTransfer.effectAllowed = "copy";
      const comp = E.byId[card.dataset.comp];
      const targetEl = els.case.querySelector(`[data-slot="${comp.slot}"]`);
      if (targetEl) targetEl.classList.add("is-target");
    });
    els.inventory.addEventListener("dragend", () => renderCase());
    els.case.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      els.case.querySelectorAll(".is-dragover").forEach((el) => el.classList.remove("is-dragover"));
      const slotEl = event.target.closest(".slot, .board");
      if (slotEl) slotEl.classList.add("is-dragover");
    });
    els.case.addEventListener("dragleave", (event) => {
      if (!els.case.contains(event.relatedTarget)) {
        els.case.querySelectorAll(".is-dragover").forEach((el) => el.classList.remove("is-dragover"));
      }
    });
    els.case.addEventListener("drop", (event) => {
      event.preventDefault();
      const compId = event.dataTransfer.getData("text/plain");
      const slotEl = event.target.closest(".slot");
      const targetSlot = slotEl && slotEl.dataset.slot !== "motherboard" ? slotEl.dataset.slot : null;
      if (!install(compId, targetSlot)) renderCase();
    });
  }

  function init() {
    els.page = document.querySelector('[data-page="pc"]');
    if (!els.page) return;
    els.tabs = $("#pc-task-tabs");
    els.mode = $("#pc-mode");
    els.score = $("#pc-m-score");
    els.mistakes = $("#pc-m-mistakes");
    els.hints = $("#pc-m-hints");
    els.time = $("#pc-m-time");
    els.task = $("#pc-task-card");
    els.hint = $("#pc-select-hint");
    els.inventory = $("#pc-inventory");
    els.case = $("#pc-case");
    els.meters = $("#pc-meters");
    els.check = $("#pc-check");
    els.launch = $("#pc-launch");
    els.console = $("#pc-console");
    els.report = $("#pc-report");

    resetState("pc-office", "learn");

    els.tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-task]");
      if (btn) switchTask(btn.dataset.task);
    });
    els.mode.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (btn) switchMode(btn.dataset.mode);
    });
    $("#pc-restart").addEventListener("click", () => {
      if (confirmLoss()) restart();
    });
    els.inventory.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "select") select(btn.dataset.id);
      else install(btn.dataset.id);
    });
    els.case.addEventListener("click", onCaseClick);
    els.check.addEventListener("click", check);
    els.launch.addEventListener("click", launch);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.selectedId && !els.page.hidden) select(state.selectedId);
    });
    bindDragAndDrop();

    mentor = SIL.Mentor.create({
      lab: "pc",
      container: $("#pc-mentor"),
      isExamRunning: () => isExam() && !state.finished,
      onHint: () => {
        if (state.finished) return;
        state.hints += 1;
        renderMetrics();
      },
      getContext: () => ({
        taskId: state.taskId,
        buildIds: Object.assign({}, state.build),
        analysis: analysis(),
        focus: E.byId[state.focusId] || null,
        launchedOk: Boolean(state.launchResult && state.launchResult.postOk)
      })
    });

    document.addEventListener("sil:lang", render);
    document.addEventListener("sil:progress", renderTabs);
    setInterval(tickTimer, 1000);
    render();
  }

  function getLiveSummary() {
    const task = E.getTask(state.taskId);
    return {
      lab: "pc", taskId: state.taskId, titleKey: `pc.tasks.${task.key}.title`, mode: state.mode,
      score: currentScoreText(), mistakes: state.mistakes, hints: state.hints,
      active: hasProgress() && !state.finished && !state.demo
    };
  }

  SIL.PcBuilder = {
    init, render, select, install, remove, check, launch, switchTask, switchMode, restart,
    startDemo, exitDemo, getLiveSummary,
    get state() { return state; },
    get mentor() { return mentor; }
  };
})();
