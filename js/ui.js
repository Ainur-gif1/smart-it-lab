/* Общие помощники интерфейса: экранирование, уведомления, скачивание файлов, иконки. */
(function () {
  "use strict";
  const SIL = (window.SIL = window.SIL || {});

  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function toast(message, type = "info", timeout = 3200) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const item = document.createElement("div");
    item.className = `toast toast-${type}`;
    item.textContent = message;
    region.appendChild(item);
    while (region.children.length > 4) region.firstElementChild.remove();
    setTimeout(() => {
      item.classList.add("leaving");
      setTimeout(() => item.remove(), 300);
    }, timeout);
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(SIL.getLang() === "kz" ? "kk-KZ" : "ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  // Простые схематичные иконки (без брендов). Цвет берётся из currentColor.
  const ICONS = {
    motherboard: '<rect x="6" y="6" width="36" height="36" rx="3"/><rect x="12" y="12" width="12" height="12" rx="1"/><path d="M30 12v18M35 12v18M12 31h18M12 36h18"/>',
    cpu: '<rect x="12" y="12" width="24" height="24" rx="2"/><rect x="18" y="18" width="12" height="12"/><path d="M18 6v6M24 6v6M30 6v6M18 36v6M24 36v6M30 36v6M6 18h6M6 24h6M6 30h6M36 18h6M36 24h6M36 30h6"/>',
    cooler: '<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="4"/><path d="M24 20c-2-6 1-10 6-10M28 24c6-2 10 1 10 6M24 28c2 6-1 10-6 10M20 24c-6 2-10-1-10-6"/>',
    ram: '<rect x="4" y="15" width="40" height="15" rx="2"/><rect x="8" y="19" width="6" height="7"/><rect x="17" y="19" width="6" height="7"/><rect x="26" y="19" width="6" height="7"/><rect x="35" y="19" width="5" height="7"/><path d="M8 30v5M14 30v5M20 30v5M28 30v5M34 30v5M40 30v5"/>',
    gpu: '<rect x="4" y="12" width="40" height="22" rx="3"/><circle cx="16" cy="23" r="6"/><circle cx="32" cy="23" r="6"/><path d="M10 34v5M16 34v5M22 34v5M28 34v5"/>',
    storage: '<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M12 18h18M12 24h12"/><circle cx="34" cy="31" r="2"/>',
    psu: '<rect x="5" y="9" width="38" height="30" rx="3"/><circle cx="20" cy="24" r="9"/><path d="M20 15v18M11 24h18M34 16v4M34 26v6"/>',
    esp32: '<rect x="10" y="4" width="28" height="40" rx="3"/><path d="M15 9h4v4h4V9h4v4h4V9h2"/><rect x="16" y="18" width="16" height="14" rx="1"/><path d="M6 20h4M6 26h4M6 32h4M38 20h4M38 26h4M38 32h4"/>',
    arduino: '<rect x="4" y="10" width="40" height="28" rx="3"/><rect x="22" y="19" width="14" height="9" rx="1"/><circle cx="11" cy="18" r="3"/><path d="M8 14h0M12 34h24M12 14h24"/>',
    dht22: '<rect x="13" y="5" width="22" height="30" rx="3"/><path d="M17 11h14M17 16h14M17 21h14M17 26h14M19 35v8M24 35v8M29 35v8"/>',
    light: '<circle cx="24" cy="20" r="9"/><path d="M24 4v4M10 10l3 3M38 10l-3 3M6 22h4M38 22h4M20 34v10M28 34v10M20 34h8"/>',
    pir: '<path d="M10 30a14 14 0 0 1 28 0z"/><rect x="7" y="30" width="34" height="8" rx="2"/><path d="M18 22l3-3M24 18v-2M30 22l-3-3"/>',
    led: '<path d="M16 28V18a8 8 0 0 1 16 0v10z"/><rect x="13" y="28" width="22" height="4" rx="1"/><path d="M20 32v12M28 32v8"/>',
    buzzer: '<circle cx="20" cy="24" r="12"/><circle cx="20" cy="24" r="3"/><path d="M36 16c3 4 3 12 0 16M41 12c5 7 5 17 0 24"/>',
    relay: '<rect x="7" y="9" width="34" height="30" rx="3"/><path d="M14 30h6l8-10M30 30h6M14 18h4"/><circle cx="20" cy="30" r="1.5"/>',
    fan: '<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="3.5"/><path d="M24 20.5c0-6 4-10 8-9 1 4-3 8-8 9zM27.5 24c6 0 10 4 9 8-4 1-8-3-9-8zM24 27.5c0 6-4 10-8 9-1-4 3-8 8-9zM20.5 24c-6 0-10-4-9-8 4-1 8 3 9 8z"/>',
    chip: '<rect x="10" y="10" width="28" height="28" rx="3"/>',
    mentor: '<rect x="8" y="12" width="32" height="24" rx="6"/><circle cx="18" cy="24" r="3"/><circle cx="30" cy="24" r="3"/><path d="M24 6v6M18 36v4M30 36v4"/>',
    progress: '<path d="M8 40V28M18 40V20M28 40V24M38 40V10"/><path d="M6 42h36"/>'
  };

  function icon(name, className = "icon") {
    const body = ICONS[name] || ICONS.chip;
    return `<svg class="${className}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  /** Таблица расчёта баллов (общая для PC Builder и IoT Lab). */
  function breakdownHtml(score, labelPrefix) {
    const t = SIL.t;
    const rows = score.parts.map((part) =>
      `<tr><td>${esc(t(labelPrefix + part.key))}</td><td class="num">${part.points} / ${part.max}</td></tr>`);
    if (score.mistakes) {
      rows.push(`<tr class="row-penalty"><td>${esc(t("common.penaltyMistakes", { n: score.mistakes }))}</td><td class="num">−${score.mistakes * 5}</td></tr>`);
    }
    if (score.hints) {
      rows.push(`<tr class="row-penalty"><td>${esc(t("common.penaltyHints", { n: score.hints }))}</td><td class="num">−${score.hints * 3}</td></tr>`);
    }
    rows.push(`<tr class="row-total"><th scope="row">${esc(t("common.total"))}</th><td class="num">${score.total} / ${score.max}</td></tr>`);
    return `<table class="breakdown"><caption>${esc(t("common.breakdown"))}</caption><tbody>${rows.join("")}</tbody></table>`;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  SIL.ui = { esc, $, $$, toast, download, formatTime, formatDate, icon, breakdownHtml, wait };
})();
