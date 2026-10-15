/* Хранение прогресса в localStorage и страница «Мой прогресс». */
(function () {
  "use strict";
  const SIL = (window.SIL = window.SIL || {});
  const STORAGE_KEY = "smartitlab.progress.v1";

  // Реестр всех заданий: используется прогрессом, статистикой и режимом преподавателя.
  const TASKS = [
    { id: "pc-office", lab: "pc", titleKey: "pc.tasks.office.title", maxScore: 100 },
    { id: "pc-gaming", lab: "pc", titleKey: "pc.tasks.gaming.title", maxScore: 100 },
    { id: "pc-work", lab: "pc", titleKey: "pc.tasks.work.title", maxScore: 100 },
    { id: "iot-light", lab: "iot", titleKey: "iot.projects.light.title", maxScore: 100 },
    { id: "iot-temp", lab: "iot", titleKey: "iot.projects.temp.title", maxScore: 100 },
    { id: "iot-motion", lab: "iot", titleKey: "iot.projects.motion.title", maxScore: 100 }
  ];

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return data && typeof data.tasks === "object" ? data : { tasks: {} };
    } catch (error) {
      return { tasks: {} };
    }
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("SMART IT LAB: не удалось сохранить прогресс", error);
    }
  }

  function notify() {
    document.dispatchEvent(new CustomEvent("sil:progress"));
  }

  /** result: { score, completed, mistakes, hints, timeSec, mode } */
  function recordAttempt(taskId, result) {
    const data = load();
    const prev = data.tasks[taskId] || { attempts: 0, best: 0, completed: false };
    data.tasks[taskId] = {
      attempts: prev.attempts + 1,
      best: Math.max(prev.best || 0, result.score),
      completed: Boolean(prev.completed || result.completed),
      lastScore: result.score,
      lastMistakes: result.mistakes,
      lastHints: result.hints,
      lastTimeSec: result.timeSec,
      lastMode: result.mode,
      lastDate: new Date().toISOString()
    };
    save(data);
    notify();
    return data.tasks[taskId];
  }

  function get(taskId) {
    return load().tasks[taskId] || null;
  }

  function summary() {
    const entries = Object.values(load().tasks);
    const completed = entries.filter((e) => e.completed).length;
    const attempts = entries.reduce((sum, e) => sum + (e.attempts || 0), 0);
    const avg = entries.length ? Math.round(entries.reduce((sum, e) => sum + (e.best || 0), 0) / entries.length) : null;
    return { completed, total: TASKS.length, attempts, avg };
  }

  function reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* storage недоступен — нечего сбрасывать */
    }
    notify();
  }

  function statusOf(entry) {
    if (!entry) return { key: "common.statusNew", cls: "status-new" };
    if (entry.completed) return { key: "common.statusDone", cls: "status-done" };
    return { key: "common.statusTried", cls: "status-tried" };
  }

  // ---------- Страница «Мой прогресс» ----------
  function renderPage() {
    const { esc, formatDate } = SIL.ui;
    const t = SIL.t;
    const body = document.getElementById("progress-rows");
    if (!body) return;
    body.innerHTML = TASKS.map((task) => {
      const entry = get(task.id);
      const status = statusOf(entry);
      return `<tr>
        <th scope="row">${esc(t(task.titleKey))}</th>
        <td>${esc(t("labs." + task.lab))}</td>
        <td><span class="status ${status.cls}">${esc(t(status.key))}</span></td>
        <td class="num">${entry ? entry.best : "—"}</td>
        <td class="num">${entry ? entry.lastScore : "—"}</td>
        <td class="num">${entry ? entry.attempts : 0}</td>
        <td>${esc(formatDate(entry && entry.lastDate))}</td>
      </tr>`;
    }).join("");
  }

  function initPage() {
    const button = document.getElementById("progress-reset");
    if (button) {
      button.addEventListener("click", () => {
        if (!window.confirm(SIL.t("progress.confirmReset"))) return;
        reset();
        SIL.ui.toast(SIL.t("progress.resetDone"), "ok");
      });
    }
    document.addEventListener("sil:progress", renderPage);
    document.addEventListener("sil:lang", renderPage);
    renderPage();
  }

  SIL.TASKS = TASKS;
  SIL.Progress = { recordAttempt, get, summary, reset, statusOf, load };
  SIL.ProgressPage = { init: initPage, render: renderPage };
})();
