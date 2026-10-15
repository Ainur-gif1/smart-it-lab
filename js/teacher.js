/* Режим преподавателя: сводка результатов и экспорт в JSON / CSV. */
(function () {
  "use strict";
  const SIL = (window.SIL = window.SIL || {});
  const t = (...args) => SIL.t(...args);
  const STUDENT_KEY = "smartitlab.studentId";

  function getStudentId() {
    try {
      return localStorage.getItem(STUDENT_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function setStudentId(value) {
    try {
      localStorage.setItem(STUDENT_KEY, value);
    } catch (error) {
      /* storage недоступен — поле просто не запомнится */
    }
  }

  function collectRows() {
    return SIL.TASKS.map((task) => {
      const entry = SIL.Progress.get(task.id);
      return {
        task_id: task.id,
        lab: t("labs." + task.lab),
        task_title: t(task.titleKey),
        competencies: t("teacher.comp." + task.id),
        max_score: task.maxScore,
        best_score: entry ? entry.best : null,
        last_score: entry ? entry.lastScore : null,
        attempts: entry ? entry.attempts : 0,
        completed: Boolean(entry && entry.completed),
        last_mistakes: entry ? entry.lastMistakes : null,
        last_hints: entry ? entry.lastHints : null,
        last_time_sec: entry ? entry.lastTimeSec : null,
        last_mode: entry ? entry.lastMode : null,
        last_date: entry ? entry.lastDate : null
      };
    });
  }

  function liveSessions() {
    return [SIL.PcBuilder, SIL.IotLab].filter(Boolean).map((lab) => lab.getLiveSummary()).filter((s) => s.active);
  }

  function stamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function exportJson() {
    const data = {
      project: "SMART IT LAB",
      exportedAt: new Date().toISOString(),
      language: SIL.getLang(),
      studentId: getStudentId(),
      summary: SIL.Progress.summary(),
      tasks: collectRows(),
      currentAttempts: liveSessions().map((s) => ({
        task_id: s.taskId, mode: s.mode, score_now: s.score, mistakes: s.mistakes, hints: s.hints
      }))
    };
    const file = `smart-it-lab-result_${stamp()}.json`;
    SIL.ui.download(file, JSON.stringify(data, null, 2), "application/json");
    SIL.ui.toast(t("teacher.exported", { file }), "ok");
    return file;
  }

  function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCsv() {
    const rows = collectRows();
    const header = ["student_id", ...Object.keys(rows[0])];
    const student = getStudentId();
    // «;» и BOM — чтобы Excel корректно открыл кириллицу.
    const lines = [header.join(";"), ...rows.map((row) => [student, ...Object.values(row)].map(csvCell).join(";"))];
    const file = `smart-it-lab-result_${stamp()}.csv`;
    SIL.ui.download(file, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
    SIL.ui.toast(t("teacher.exported", { file }), "ok");
    return file;
  }

  function render() {
    const { esc } = SIL.ui;
    const body = document.getElementById("teacher-rows");
    if (!body) return;
    body.innerHTML = collectRows().map((row) => {
      const status = SIL.Progress.statusOf(SIL.Progress.get(row.task_id));
      const dash = (v) => (v === null || v === undefined ? "—" : v);
      return `<tr>
        <th scope="row">${esc(row.task_title)}<span class="muted small block">${esc(row.lab)}</span></th>
        <td class="small">${esc(row.competencies)}</td>
        <td class="num">${row.max_score}</td>
        <td class="num">${dash(row.best_score)}</td>
        <td class="num">${dash(row.last_score)}</td>
        <td class="num">${dash(row.last_mistakes)}</td>
        <td class="num">${dash(row.last_hints)}</td>
        <td class="num">${row.attempts}</td>
        <td><span class="status ${status.cls}">${esc(t(status.key))}</span></td>
      </tr>`;
    }).join("");

    const live = document.getElementById("teacher-live");
    const sessions = liveSessions();
    live.hidden = sessions.length === 0;
    live.querySelector("ul").innerHTML = sessions.map((s) => `<li>${esc(t("teacher.liveTask", {
      lab: t("labs." + s.lab), task: t(s.titleKey), mode: t("common." + s.mode),
      score: s.score, mistakes: s.mistakes, hints: s.hints
    }))}</li>`).join("");
  }

  function init() {
    const input = document.getElementById("teacher-student");
    if (!input) return;
    input.value = getStudentId();
    input.addEventListener("input", () => setStudentId(input.value.trim()));
    document.getElementById("teacher-export-json").addEventListener("click", exportJson);
    document.getElementById("teacher-export-csv").addEventListener("click", exportCsv);
    document.addEventListener("sil:progress", render);
    document.addEventListener("sil:lang", render);
    render();
  }

  SIL.Teacher = { init, render, exportJson, exportCsv, collectRows };
})();
