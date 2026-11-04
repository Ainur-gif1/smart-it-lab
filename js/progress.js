/* Local classroom records. One immutable result for each attempt ID. */
(function () {
  'use strict';
  const SIL = window.SIL = window.SIL || {};
  const KEY = 'smartitlab.classroom.v2' + (window.SIL_SERVER_USER ? '.' + window.SIL_SERVER_USER.id : '');
  const TASKS = [
    { id: 'pc-office', lab: 'pc', titleKey: 'pc.tasks.office.title', maxScore: 100 },
    { id: 'pc-gaming', lab: 'pc', titleKey: 'pc.tasks.gaming.title', maxScore: 100 },
    { id: 'pc-work', lab: 'pc', titleKey: 'pc.tasks.work.title', maxScore: 100 },
    { id: 'iot-light', lab: 'iot', titleKey: 'iot.projects.light.title', maxScore: 100 },
    { id: 'iot-temp', lab: 'iot', titleKey: 'iot.projects.temp.title', maxScore: 100 },
    { id: 'iot-motion', lab: 'iot', titleKey: 'iot.projects.motion.title', maxScore: 100 }
  ];
  const empty = () => ({ version: 2, attempts: [], studentCode: '', reports: {} });
  let data = empty(), loaded = false, storageAvailable = true, sequence = 0;
  const clone = v => JSON.parse(JSON.stringify(v));
  const taskById = id => TASKS.find(t => t.id === id);
  function newAttemptId() {
    return window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID() : 'attempt-' + Date.now().toString(36) + '-' + (++sequence) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function shortText(v, max) { return typeof v === 'string' && v.length <= max; }
  function validateReport(r) {
    return r && typeof r === 'object' && ['evidence', 'fixes', 'conclusion'].every(k => shortText(r[k], 6000));
  }
  function validateAttempt(a) {
    if (!a || typeof a !== 'object' || !shortText(a.id, 100) || !/^[a-zA-Z0-9._-]+$/.test(a.id) || !taskById(a.taskId)) return false;
    if (!shortText(a.studentCode, 60) || !shortText(a.date, 40) || !Number.isFinite(Date.parse(a.date)) || !['learn', 'exam'].includes(a.mode)) return false;
    if (!Number.isFinite(a.score) || a.score < 0 || a.score > 100 || typeof a.completed !== 'boolean') return false;
    if (!['mistakes', 'hints', 'timeSec'].every(k => Number.isSafeInteger(a[k]) && a[k] >= 0 && a[k] <= 31536000)) return false;
    if (!a.checkResult || typeof a.checkResult.ok !== 'boolean' || !Array.isArray(a.checkResult.issueCodes) || a.checkResult.issueCodes.length > 100 || !a.checkResult.issueCodes.every(c => shortText(c, 80))) return false;
    if (a.snapshot !== undefined && (!a.snapshot || typeof a.snapshot !== 'object' || JSON.stringify(a.snapshot).length > 30000)) return false;
    if (a.report !== undefined && !validateReport(a.report)) return false;
    return true;
  }
  function normalizeAttempt(a) {
    if (!validateAttempt(a)) throw new Error('Invalid attempt');
    return {
      id: a.id, taskId: a.taskId, studentCode: a.studentCode, date: a.date, mode: a.mode,
      score: a.score, completed: a.completed, mistakes: a.mistakes, hints: a.hints, timeSec: a.timeSec,
      checkResult: { ok: a.checkResult.ok, issueCodes: a.checkResult.issueCodes.slice() },
      ...(a.snapshot ? { snapshot: clone(a.snapshot) } : {}),
      ...(a.report ? { report: { evidence: a.report.evidence, fixes: a.report.fixes, conclusion: a.report.conclusion } } : {})
    };
  }
  function notice() {
    const el = document.getElementById('storage-notice');
    if (el) { el.hidden = storageAvailable; el.textContent = SIL.t('classroom.storageWarning'); }
  }
  function loadData() {
    if (loaded) return data;
    loaded = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (!s || s.version !== 2 || !Array.isArray(s.attempts) || !s.attempts.every(validateAttempt) || !shortText(s.studentCode, 60)) throw new Error('Invalid stored results');
        const ids = new Set();
        if (s.attempts.some(a => ids.has(a.id) || !ids.add(a.id))) throw new Error('Duplicate stored attempt');
        data = { version: 2, studentCode: s.studentCode, attempts: s.attempts.map(normalizeAttempt), reports: {} };
        if (s.reports && typeof s.reports === 'object') for (const a of data.attempts) {
          if (validateReport(s.reports[a.id])) data.reports[a.id] = clone(s.reports[a.id]);
        }
      }
    } catch (_) { storageAvailable = false; }
    notice(); return data;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); storageAvailable = true; }
    catch (_) { storageAvailable = false; }
    notice();
  }
  function notify() { document.dispatchEvent(new CustomEvent('sil:progress')); }
  function attempts() {
    const s = loadData();
    return s.attempts.map(a => ({ ...clone(a), report: clone(s.reports[a.id] || a.report || { evidence: '', fixes: '', conclusion: '' }) }));
  }
  function get(taskId) {
    const list = loadData().attempts.filter(a => a.taskId === taskId);
    if (!list.length) return null;
    const a = list[list.length - 1];
    return { attempts: list.length, best: Math.max(...list.map(x => x.score)), completed: list.some(x => x.completed), lastScore: a.score, lastMistakes: a.mistakes, lastHints: a.hints, lastTimeSec: a.timeSec, lastMode: a.mode, lastDate: a.date };
  }
  function load() { return { tasks: Object.fromEntries(TASKS.map(t => [t.id, get(t.id)]).filter(([, v]) => v)), attempts: attempts() }; }
  function summary() {
    const entries = TASKS.map(t => get(t.id)).filter(Boolean);
    return { completed: entries.filter(e => e.completed).length, total: TASKS.length, attempts: loadData().attempts.length, avg: entries.length ? Math.round(entries.reduce((s, e) => s + e.best, 0) / entries.length) : null };
  }
  function recordAttempt(taskId, r) {
    loadData();
    const id = r.attemptId || newAttemptId();
    const existing = data.attempts.find(a => a.id === id);
    if (existing) return clone(existing);
    const a = normalizeAttempt({ id, taskId, studentCode: data.studentCode, date: new Date().toISOString(), mode: r.mode, score: r.score, completed: !!r.completed, mistakes: r.mistakes, hints: r.hints, timeSec: Math.round(r.timeSec), snapshot: r.snapshot, checkResult: r.checkResult || { ok: !!r.completed, issueCodes: [] } });
    data.attempts.push(a); persist(); notify(); return clone(a);
  }
  function setStudentId(value) { loadData(); data.studentCode = String(value).trim().slice(0, 60); persist(); document.dispatchEvent(new CustomEvent('sil:student')); }
  function getStudentId() { return loadData().studentCode; }
  function saveReport(id, report) {
    loadData(); if (!data.attempts.some(a => a.id === id) || !validateReport(report)) return false;
    data.reports[id] = clone(report); persist(); return true;
  }
  function reset() { loadData(); data = { ...empty(), studentCode: data.studentCode }; persist(); notify(); }
  function statusOf(e) { return !e ? { key: 'common.statusNew', cls: 'status-new' } : e.completed ? { key: 'common.statusDone', cls: 'status-done' } : { key: 'common.statusTried', cls: 'status-tried' }; }
  function renderPage() {
    const { esc, formatDate } = SIL.ui, t = SIL.t;
    const body = document.getElementById('progress-rows'); if (!body) return;
    body.innerHTML = TASKS.map(task => {
      const e = get(task.id), s = statusOf(e);
      return `<tr><th scope="row">${esc(t(task.titleKey))}</th><td>${esc(t('labs.' + task.lab))}</td><td><span class="status ${s.cls}">${esc(t(s.key))}</span></td><td>${e ? e.best : '—'}</td><td>${e ? e.lastScore : '—'}</td><td>${e ? e.attempts : 0}</td><td>${esc(formatDate(e && e.lastDate))}</td></tr>`;
    }).join('');
    const history = document.getElementById('attempt-rows');
    if (history) history.innerHTML = attempts().slice().reverse().map(a => `<tr><td>${esc(a.studentCode || '—')}</td><th scope="row">${esc(t(taskById(a.taskId).titleKey))}</th><td>${esc(formatDate(a.date))}</td><td>${esc(t('common.' + a.mode))}</td><td>${a.score} / 100</td><td>${a.timeSec}</td><td>${a.mistakes} / ${a.hints}</td><td><a class="btn btn-small" href="#report/${encodeURIComponent(a.id)}">${esc(t('classroom.report'))}</a></td></tr>`).join('') || `<tr><td colspan="8">${esc(t('classroom.noAttempts'))}</td></tr>`;
    notice();
  }
  function initPage() {
    loadData(); document.getElementById('progress-reset').addEventListener('click', () => { if (window.confirm(SIL.t('progress.confirmReset'))) reset(); });
    document.addEventListener('sil:progress', renderPage); document.addEventListener('sil:lang', renderPage); renderPage();
  }
  SIL.TASKS = TASKS;
  SIL.Progress = { newAttemptId, recordAttempt, get, summary, reset, statusOf, load, attempts, getStudentId, setStudentId, saveReport, validateAttempt, normalizeAttempt, validateReport, notice };
  SIL.ProgressPage = { init: initPage, render: renderPage };
})();
