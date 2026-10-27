/* Точка входа: навигация по страницам, переключение языка, статистика, демонстрация. */
(function () {
  "use strict";
  const SIL = window.SIL;
  const t = (...args) => SIL.t(...args);
  const { $, $$, esc } = SIL.ui;
  const LANG_KEY = "smartitlab.lang";
  const ROUTES = ["home", "practice", "pc", "iot", "mentor", "progress", "teacher", "about"];
  let currentRoute = null;
  const demo = { lab: null };

  // ---------------- Язык ----------------
  function applyStaticTranslations() {
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); }); // только собственные строки из translations.js
    $$("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":");
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      });
    });
  }

  function setLanguage(lang, { save = true } = {}) {
    SIL.setLang(lang);
    const active = SIL.getLang();
    document.documentElement.lang = active === "kz" ? "kk" : "ru";
    $$("[data-lang]").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.lang === active)));
    if (save) {
      try { localStorage.setItem(LANG_KEY, active); } catch (error) { /* без сохранения */ }
    }
    applyStaticTranslations();
    renderStats();
    renderDemoBanner();
    updateTitle();
    document.dispatchEvent(new CustomEvent("sil:lang"));
  }

  function savedLanguage() {
    try { return localStorage.getItem(LANG_KEY) || "ru"; } catch (error) { return "ru"; }
  }

  // ---------------- Навигация ----------------
  function updateTitle() {
    const names = { home: "", practice: "practice.nav", pc: "nav.pc", iot: "nav.iot", mentor: "nav.mentor", progress: "nav.progress", teacher: "nav.teacher", about: "nav.about" };
    const key = names[currentRoute];
    document.title = key ? `${t(key)} — SMART IT LAB` : `SMART IT LAB — ${t("app.subtitle")}`;
  }

  function showPage(route) {
    currentRoute = route;
    $$("[data-page]").forEach((page) => { page.hidden = page.dataset.page !== route; });
    $$("[data-route]").forEach((link) => {
      if (link.dataset.route === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    closeMobileNav();
    updateTitle();
    if (route === "home") renderStats();
    if (route === "teacher") SIL.Teacher.render();
    if (route === "progress") SIL.ProgressPage.render();
    window.scrollTo(0, 0);
  }

  function onHashChange() {
    const route = location.hash.replace(/^#\/?/, "");
    if (ROUTES.includes(route)) showPage(route);
    else if (!currentRoute) showPage("home");
    // Прочие якоря (например, #main у ссылки «Перейти к содержимому») страницу не меняют.
  }

  function closeMobileNav() {
    const toggle = $("#nav-toggle");
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", "false");
    $("#site-nav").classList.remove("is-open");
  }

  // ---------------- Статистика на главной ----------------
  function renderStats() {
    const s = SIL.Progress.summary();
    $("#stat-completed").textContent = `${s.completed} / ${s.total}`;
    $("#stat-attempts").textContent = s.attempts;
    $("#stat-avg").textContent = s.avg === null ? "—" : `${s.avg}%`;
  }

  // ---------------- Демонстрация ----------------
  function startDemo(lab) {
    const dialog = $("#demo-dialog");
    if (dialog.open) dialog.close();
    if (lab === "pc") SIL.PcBuilder.startDemo();
    else SIL.IotLab.startDemo();
    location.hash = "#" + lab;
  }

  function renderDemoBanner() {
    const banner = $("#demo-banner");
    banner.hidden = !demo.lab;
    if (!demo.lab) return;
    $("#demo-banner-title").textContent = `${t(demo.lab === "pc" ? "demo.pc" : "demo.iot")} · ${t("demo.banner")}`;
    $("#demo-steps").innerHTML = t(demo.lab === "pc" ? "demo.pcSteps" : "demo.iotSteps");
  }

  function exitDemo() {
    if (demo.lab === "pc") SIL.PcBuilder.exitDemo();
    if (demo.lab === "iot") SIL.IotLab.exitDemo();
    demo.lab = null;
    renderDemoBanner();
  }

  function openDemoDialog() {
    const dialog = $("#demo-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  // ---------------- Инициализация ----------------
  function init() {
    SIL.setLang(savedLanguage());
    SIL.PcBuilder.init();
    SIL.IotLab.init();
    SIL.MentorPage.init();
    SIL.ProgressPage.init();
    SIL.Teacher.init();
    SIL.Practice.init();

    $$("[data-lang]").forEach((btn) => btn.addEventListener("click", () => setLanguage(btn.dataset.lang)));
    $("#nav-toggle").addEventListener("click", () => {
      const open = $("#site-nav").classList.toggle("is-open");
      $("#nav-toggle").setAttribute("aria-expanded", String(open));
    });
    $$("[data-open-demo]").forEach((btn) => btn.addEventListener("click", openDemoDialog));
    $$("[data-start-demo]").forEach((btn) => btn.addEventListener("click", () => startDemo(btn.dataset.startDemo)));
    $("#demo-close").addEventListener("click", () => $("#demo-dialog").close());
    $("#demo-exit").addEventListener("click", exitDemo);
    $(".skip-link").addEventListener("click", (event) => {
      event.preventDefault();
      $("#main").focus();
    });

    document.addEventListener("sil:demo", (event) => {
      const { lab, active } = event.detail;
      if (active) demo.lab = lab;
      else if (demo.lab === lab) demo.lab = null;
      renderDemoBanner();
    });
    document.addEventListener("sil:progress", renderStats);
    window.addEventListener("hashchange", onHashChange);

    setLanguage(SIL.getLang(), { save: false });
    onHashChange();
    document.body.classList.add("is-ready");
  }

  SIL.App = { setLanguage, showPage, startDemo, exitDemo, escape: esc };
  document.addEventListener("DOMContentLoaded", init);
})();

