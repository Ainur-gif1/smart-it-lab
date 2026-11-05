/* Validated local exports and classroom aggregation. No server-side grade trust. */
(function () {
  'use strict';
  const SIL = window.SIL, t = (...v) => SIL.t(...v), P = SIL.Progress;
  const FORMAT = 'smartitlab-classroom-v2';
  let imported = [];
  const task = id => SIL.TASKS.find(x => x.id === id);
  function collectRows() {
    return P.attempts().map(a => ({ student_code: a.studentCode, attempt_id: a.id, task_id: a.taskId, task_title: t(task(a.taskId).titleKey), date: a.date, mode: a.mode, score: a.score, max_score: 100, time_sec: a.timeSec, mistakes: a.mistakes, hints: a.hints, completed: a.completed, check_ok: a.checkResult.ok, issue_codes: a.checkResult.issueCodes.join(', '), evidence: a.report.evidence, fixes: a.report.fixes, conclusion: a.report.conclusion }));
  }
  function csvCell(v) {
    let text = v == null ? '' : String(v);
    if (typeof v === 'string' && /^[\s\u0000-\u001f]*[=+@\-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function csv(rows) {
    const keys = ['student_code', 'attempt_id', 'task_id', 'task_title', 'date', 'mode', 'score', 'max_score', 'time_sec', 'mistakes', 'hints', 'completed', 'check_ok', 'issue_codes', 'evidence', 'fixes', 'conclusion'];
    return '\uFEFF' + [keys.map(csvCell).join(';'), ...rows.map(r => keys.map(k => csvCell(r[k])).join(';'))].join('\r\n');
  }
  function payload(list = P.attempts()) { return { format: FORMAT, exportedAt: new Date().toISOString(), language: SIL.getLang(), attempts: list }; }
  function exportJson() { SIL.ui.download('smart-it-lab-results.json', JSON.stringify(payload(), null, 2), 'application/json'); }
  function exportCsv() { SIL.ui.download('smart-it-lab-results.csv', csv(collectRows()), 'text/csv;charset=utf-8'); }
  function validatePayload(raw) {
    if (!raw || raw.format !== FORMAT || !Array.isArray(raw.attempts) || raw.attempts.length > 2000 || !raw.attempts.every(P.validateAttempt)) throw new Error('Invalid report format');
    const ids = new Set();
    const rows = raw.attempts.map(P.normalizeAttempt);
    if (rows.some(a => ids.has(a.id) || !ids.add(a.id))) throw new Error('Duplicate IDs in file');
    return rows;
  }
  async function importFiles(files) {
    if (!Array.isArray(files)) files = Array.from(files);
    const next = new Map(imported.map(a => [a.id, a]));
    const local = new Map(P.attempts().map(a => [a.id, a]));
    let accepted = 0, rejected = files.length > 50 ? files.length - 50 : 0, duplicates = 0;
    for (const file of files.slice(0, 50)) {
      try {
        if (file.size > 2000000) throw new Error('File too large');
        const rows = validatePayload(JSON.parse(await file.text()));
        if (next.size + rows.filter(a => !next.has(a.id) && !local.has(a.id)).length > 5000) throw new Error('Too many records');
        // Validate the whole file before mutating the imported table.
        for (const a of rows) {
          const prev = next.get(a.id) || local.get(a.id);
          if (prev && JSON.stringify(P.normalizeAttempt(prev)) !== JSON.stringify(a)) throw new Error('Conflicting attempt ID');
        }
        for (const a of rows) { if (next.has(a.id) || local.has(a.id)) duplicates++; else { next.set(a.id, a); accepted++; } }
      } catch (_) { rejected++; }
    }
    imported = Array.from(next.values()); render();
    const status = document.getElementById('teacher-import-status');
    if (status) status.textContent = t('classroom.importSummary', { n: accepted, errors: rejected, duplicates });
    return { accepted, rejected, duplicates };
  }
  function combined() { const rows = new Map(P.attempts().map(a => [a.id, a])); for (const a of imported) if (!rows.has(a.id)) rows.set(a.id, a); return Array.from(rows.values()); }
  function exportCombined() { SIL.ui.download('smart-it-lab-class.json', JSON.stringify(payload(combined()), null, 2), 'application/json'); }
  function render() {
    const { esc, formatDate } = SIL.ui, body = document.getElementById('teacher-rows'); if (!body) return;
    body.innerHTML = combined().map(a => `<tr><td>${esc(a.studentCode || '—')}</td><th scope="row">${esc(t(task(a.taskId).titleKey))}</th><td>${esc(formatDate(a.date))}</td><td>${esc(t('common.' + a.mode))}</td><td>${a.score} / 100</td><td>${a.timeSec}</td><td>${a.mistakes}</td><td>${a.hints}</td><td>${esc(t(a.checkResult.ok ? 'classroom.checkPass' : 'classroom.checkFail'))}</td></tr>`).join('') || `<tr><td colspan="9">${esc(t('classroom.noAttempts'))}</td></tr>`;
    const input = document.getElementById('teacher-student'); if (input && document.activeElement !== input) input.value = P.getStudentId();
  }
  function init() {
    const input = document.getElementById('teacher-student');
    input.value = P.getStudentId(); input.addEventListener('input', () => P.setStudentId(input.value));
    document.getElementById('teacher-export-json').addEventListener('click', exportJson);
    document.getElementById('teacher-export-csv').addEventListener('click', exportCsv);
    document.getElementById('teacher-import').addEventListener('change', e => { importFiles(e.target.files).catch(() => SIL.ui.toast(t('classroom.importError'), 'error')); e.target.value = ''; });
    document.getElementById('teacher-export-class').addEventListener('click', exportCombined);
    document.addEventListener('sil:progress', render); document.addEventListener('sil:lang', render); document.addEventListener('sil:student', render); render();
  }
  SIL.Teacher = { init, render, exportJson, exportCsv, collectRows, importFiles, validatePayload, csv, payload, combined };
})();
