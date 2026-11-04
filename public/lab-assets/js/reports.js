(function () {
  'use strict';
  const S = window.SIL, P = S.Progress, e = S.ui.esc;
  let selectedId = null;
  function current() { return P.attempts().find(a => a.id === selectedId); }
  function render() {
    const el = document.getElementById('report-content'), a = current(), t = k => S.t('classroom.' + k);
    if (!el) return;
    if (!a) { el.innerHTML = `<h1>${e(t('report'))}</h1><p>${e(t('reportMissing'))}</p><a class="btn" href="#progress">${e(t('back'))}</a>`; return; }
    const task = S.TASKS.find(x => x.id === a.taskId);
    el.innerHTML = `<div class="page-head"><h1>${e(t('report'))}</h1><p class="lead">${e(S.t(task.titleKey))}</p><p>${e(t('reportLead'))}</p></div>
      <div class="panel"><dl class="report-facts"><dt>${e(t('student'))}</dt><dd>${e(a.studentCode || '—')}</dd><dt>${e(t('date'))}</dt><dd>${e(S.ui.formatDate(a.date))}</dd><dt>${e(t('mode'))}</dt><dd>${e(S.t('common.' + a.mode))}</dd><dt>${e(t('score'))}</dt><dd>${a.score} / 100</dd><dt>${e(t('time'))}</dt><dd>${a.timeSec}</dd><dt>${e(t('errorsHints'))}</dt><dd>${a.mistakes} / ${a.hints}</dd><dt>${e(S.t(task.lab === 'iot' ? 'iot.check' : 'pc.check'))}</dt><dd>${e(t(a.checkResult.ok ? 'checkPass' : 'checkFail'))}</dd></dl><p class="small">ID: ${e(a.id)}</p></div>
      <div class="panel">${['evidence','fixes','conclusion'].map(k => `<label class="report-label" for="report-${k}">${e(t(k))}</label><textarea id="report-${k}" data-report-field="${k}" maxlength="6000" rows="4">${e(a.report[k])}</textarea><p class="print-answer" data-print-field="${k}">${e(a.report[k])}</p>`).join('')}<p id="report-save-status" role="status" class="no-print"></p></div>
      <div class="btn-row no-print"><button type="button" id="report-save" class="btn">${e(t('save'))}</button><button type="button" id="report-export" class="btn btn-primary">${e(t('exportReport'))}</button><button type="button" id="report-print" class="btn">${e(t('print'))}</button><a href="#progress" class="btn btn-ghost">${e(t('back'))}</a></div><p class="note">${e(t('localWarning'))}</p>`;
    const save = () => {
      const report = Object.fromEntries(['evidence','fixes','conclusion'].map(k => [k, document.getElementById('report-' + k).value]));
      P.saveReport(selectedId, report);
      el.querySelectorAll('[data-print-field]').forEach(p => { p.textContent = report[p.dataset.printField]; });
      document.getElementById('report-save-status').textContent = t('saved');
    };
    el.querySelectorAll('[data-report-field]').forEach(f => f.addEventListener('input', save));
    document.getElementById('report-save').addEventListener('click', save);
    document.getElementById('report-export').addEventListener('click', () => { save(); S.ui.download('smart-it-lab-report.json', JSON.stringify(S.Teacher.payload([current()]), null, 2), 'application/json'); });
    document.getElementById('report-print').addEventListener('click', () => { save(); window.print(); });
  }
  function open(id) { selectedId = id; render(); }
  function init() { document.addEventListener('sil:lang', render); }
  S.Reports = { init, render, open };
})();
