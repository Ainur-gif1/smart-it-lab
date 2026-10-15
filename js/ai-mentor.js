/*
 * AI Mentor — интеллектуальный помощник.
 *
 * Базовая версия — локальная экспертная система: набор правил, которые
 * анализируют ТЕКУЩЕЕ состояние лаборатории (задание, компоненты, GPIO,
 * результаты проверки) и формируют подсказку. Ответы не случайны.
 *
 * Если в js/config.js задан AI_ENDPOINT, вопрос и краткое описание состояния
 * отправляются на ваш backend (без персональных данных). При ошибке —
 * используется локальный ответ.
 */
(function () {
  "use strict";
  const SIL = (window.SIL = window.SIL || {});
  const t = (...args) => SIL.t(...args);
  const PE = SIL.PcEngine;
  const IE = SIL.IotEngine;

  const PENALIZED_INTENTS = ["wrong", "next", "why"];
  const INTENTS = ["wrong", "next", "explain", "why"];

  // ===================== Правила для PC Builder =====================
  const compatIssues = (a) => a.issues.filter((i) => i.code !== "missing");
  const missingIssues = (a) => a.issues.filter((i) => i.code === "missing");

  /** Совместим ли компонент с текущей сборкой: «примеряем» его в слот. */
  function pcFitNote(comp, buildIds, taskId) {
    const trial = Object.assign({}, buildIds, { [comp.slot]: comp.id });
    const problems = PE.analyze(trial, taskId).issues.filter(
      (i) => i.code !== "missing" && i.slots.includes(comp.slot)
    );
    if (problems.length) return t("mentor.fit.bad", { reason: PE.describeIssue(problems[0]) });
    const hasNeighbours = Object.keys(buildIds).some((slot) => slot !== comp.slot && buildIds[slot]);
    return hasNeighbours ? t("mentor.fit.ok") : "";
  }

  function explainPcComponent(comp) {
    return `${comp.name}. ${t("pc.explain." + comp.slot)}\n${PE.specList(comp).join(" · ")}`;
  }

  const pcRules = {
    wrong(ctx) {
      const a = ctx.analysis;
      const compat = compatIssues(a);
      const missing = missingIssues(a);
      if (!compat.length && !missing.length) {
        const unmet = a.conditions.filter((c) => !c.met);
        if (unmet.length) return t("mentor.pc.okButTask", { list: unmet.map((c) => `«${t(c.key)}»`).join(", ") });
        return t("mentor.pc.allGood");
      }
      const lines = [t("mentor.foundProblems", { n: compat.length + missing.length })];
      compat.forEach((issue) => lines.push("• " + PE.describeIssue(issue)));
      if (missing.length) {
        lines.push("• " + t("mentor.pc.missingList", { list: missing.map((i) => t("pc.slots." + i.params.slot)).join(", ") }));
      }
      if (compat.length) lines.push(t("mentor.tryWhy"));
      return lines.join("\n");
    },

    next(ctx) {
      const a = ctx.analysis;
      const b = a.build;
      const taskKey = a.task.key;
      // Отсутствие видеовыхода решается позже (видеокарту обычно ставят ближе к концу).
      const compat = compatIssues(a).filter((i) => i.code !== "video");
      if (compat.length) {
        return t("mentor.pc.nextFix", { issue: PE.describeIssue(compat[0]), fix: PE.describeFix(compat[0]) });
      }
      if (!b.motherboard) return t("mentor.pc.nextMotherboard");
      if (!b.cpu) {
        let text = t("mentor.pc.nextCpu", { socket: b.motherboard.socket, mb: b.motherboard.name });
        if (taskKey === "office") text += " " + t("mentor.pc.tipCpuOffice");
        if (taskKey === "work") text += " " + t("mentor.pc.tipCpuWork");
        return text;
      }
      if (!b.cooler) return t("mentor.pc.nextCooler", { cpu: b.cpu.name, tdp: b.cpu.tdp });
      if (!b.ram) {
        let text = t("mentor.pc.nextRam", { ramType: b.motherboard.ramType, mb: b.motherboard.name });
        if (taskKey === "gaming") text += " " + t("mentor.pc.tipRamGaming");
        if (taskKey === "work") text += " " + t("mentor.pc.tipRamWork");
        return text;
      }
      if (!b.storage) {
        return t("mentor.pc.nextStorage") + (taskKey === "work" ? " " + t("mentor.pc.tipStorageWork") : "");
      }
      if (taskKey === "gaming" && !(b.gpu && b.gpu.power >= 220)) return t("mentor.pc.nextGpuGaming");
      if (!b.psu) return t("mentor.pc.nextPsu", { req: a.power.required, rec: a.power.recommended });
      const videoIssue = a.issues.find((i) => i.code === "video");
      if (videoIssue) {
        return t("mentor.pc.nextFix", { issue: PE.describeIssue(videoIssue), fix: PE.describeFix(videoIssue) });
      }
      const unmet = a.conditions.find((c) => !c.met);
      if (unmet) return t("mentor.pc.nextCondition", { cond: t(unmet.key), tip: t(unmet.tipKey) });
      return ctx.launchedOk ? t("mentor.pc.nextDone") : t("mentor.pc.nextLaunch");
    },

    explain(ctx) {
      const comp = ctx.focus;
      if (comp) {
        const fit = pcFitNote(comp, ctx.buildIds, ctx.taskId);
        return explainPcComponent(comp) + (fit ? "\n" + fit : "");
      }
      const slot = PE.REQUIRED_SLOTS.find((s) => !ctx.analysis.build[s]) || "gpu";
      return t("mentor.pc.explainSlot", { slot: t("pc.slots." + slot), text: t("pc.explain." + slot) });
    },

    why(ctx) {
      const a = ctx.analysis;
      const compat = compatIssues(a);
      if (!compat.length) {
        const missing = missingIssues(a);
        if (missing.length) {
          return t("mentor.why.noneMissing", { list: missing.map((i) => t("pc.slots." + i.params.slot)).join(", ") });
        }
        return t("mentor.why.none");
      }
      const blocks = compat.map((issue) =>
        [PE.describeIssue(issue), t("mentor.why." + issue.code), PE.describeFix(issue)].join("\n"));
      return t("mentor.why.intro") + "\n\n" + blocks.join("\n\n");
    }
  };

  // ===================== Правила для IoT Lab =====================
  function explainIotComponent(id) {
    return `${IE.compName(id)}. ${t("iot.explain." + id)}`;
  }

  const iotRules = {
    wrong(ctx) {
      const a = ctx.analysis;
      if (!a.issues.length) return ctx.checked ? t("mentor.iot.allGoodChecked") : t("mentor.iot.allGood");
      const lines = [];
      if (a.errors.length) lines.push(t("mentor.foundProblems", { n: a.errors.length }));
      a.issues.forEach((issue) => lines.push((issue.level === "warning" ? "△ " : "• ") + IE.describeIssue(issue)));
      if (a.errors.some((e) => ["inputOnly", "needAdc", "dupPin", "wrongController"].includes(e.code))) {
        lines.push(t("mentor.tryWhy"));
      }
      return lines.join("\n");
    },

    next(ctx) {
      const a = ctx.analysis;
      const project = a.project;
      const errorOf = (code) => a.errors.find((e) => e.code === code);
      if (errorOf("noController")) return t("mentor.iot.nextController");
      const wrongCtrl = errorOf("wrongController");
      if (wrongCtrl) return t("mentor.iot.nextFix", { issue: IE.describeIssue(wrongCtrl), fix: IE.describeFix(wrongCtrl) });
      for (const id of [project.sensor, project.output]) {
        const missing = a.errors.find((e) => e.code === "missing" && e.compId === id);
        if (missing) return t("mentor.iot.nextAdd", { name: IE.compName(id) });
        const notWired = a.errors.find((e) => e.code === "notWired" && e.compId === id);
        if (notWired) {
          const rec = IE.RECOMMENDED_PINS[id];
          return t("mentor.iot.nextWire", { name: IE.compName(id), pin: IE.pinLabel(rec.pin), reason: t("iot.pinReason." + rec.reason) });
        }
      }
      if (a.errors.length) {
        const first = a.errors[0];
        return t("mentor.iot.nextFix", { issue: IE.describeIssue(first), fix: IE.describeFix(first) });
      }
      if (!ctx.checked) return t("mentor.iot.nextCheck");
      if (!(ctx.observed.on && ctx.observed.off)) {
        return t("mentor.iot.nextSimulate", {
          control: t(`iot.projects.${project.key}.control`),
          act: IE.compName(project.output)
        });
      }
      return t("mentor.iot.nextDone");
    },

    explain(ctx) {
      if (ctx.focusId) return explainIotComponent(ctx.focusId);
      const a = ctx.analysis;
      const nextId = !ctx.controller ? "esp32"
        : [a.project.sensor, a.project.output].find((id) => !ctx.modules.some((m) => m.id === id)) || a.project.sensor;
      return t("mentor.iot.explainNone", { name: IE.compName(nextId), text: t("iot.explain." + nextId) });
    },

    why(ctx) {
      const a = ctx.analysis;
      const reasons = a.errors.filter((e) => ["inputOnly", "needAdc", "dupPin", "wrongController"].includes(e.code));
      if (!reasons.length) {
        if (a.errors.length) {
          return t("mentor.why.noneMissing", { list: a.errors.map((e) => IE.describeIssue(e)).join(" ") });
        }
        return t("mentor.why.iotNone");
      }
      const blocks = reasons.map((issue) =>
        [IE.describeIssue(issue), t("mentor.why." + issue.code), IE.describeFix(issue)].join("\n"));
      return t("mentor.why.intro") + "\n\n" + blocks.join("\n\n");
    }
  };

  const RULES = { pc: pcRules, iot: iotRules };

  /** Краткое описание состояния для внешнего AI. Без персональных данных. */
  function summarizeContext(lab, ctx) {
    const a = ctx.analysis;
    if (lab === "pc") {
      return {
        task: ctx.taskId,
        build: ctx.buildIds,
        issues: a.issues.map((i) => ({ code: i.code, text: PE.describeIssue(i) })),
        conditions: a.conditions.map((c) => ({ text: t(c.key), met: c.met })),
        powerRequiredW: a.power.required
      };
    }
    return {
      project: a.project.id,
      controller: ctx.controller,
      modules: ctx.modules,
      issues: a.issues.map((i) => ({ code: i.code, text: IE.describeIssue(i) })),
      schemeChecked: ctx.checked
    };
  }

  async function askRemote(payload) {
    const config = window.SIL_CONFIG || {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS || 8000);
    try {
      const response = await fetch(config.AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!data || typeof data.reply !== "string" || !data.reply.trim()) throw new Error("Empty reply");
      return data.reply.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  const remoteEnabled = () => Boolean(window.SIL_CONFIG && window.SIL_CONFIG.AI_ENDPOINT);

  /**
   * Создаёт панель AI Mentor внутри container.
   * options: { lab, container, getContext(), isExamRunning(), onHint() }
   */
  function create(options) {
    const { esc, toast, icon } = SIL.ui;
    const messages = [{ role: "mentor", key: "mentor.greeting" }];
    let busy = false;

    options.container.innerHTML = `
      <section class="panel mentor" aria-labelledby="${options.lab}-mentor-title">
        <header class="mentor-head">
          <span class="mentor-avatar">${icon("mentor")}</span>
          <div>
            <h2 id="${options.lab}-mentor-title" class="panel-title">AI MENTOR</h2>
            <p class="mentor-status"></p>
          </div>
        </header>
        <div class="mentor-log" role="log" aria-live="polite" tabindex="0"></div>
        <div class="mentor-actions">
          ${INTENTS.map((intent) => `<button type="button" class="btn btn-mentor" data-intent="${intent}"></button>`).join("")}
        </div>
        <p class="mentor-note"></p>
      </section>`;

    const log = options.container.querySelector(".mentor-log");
    const status = options.container.querySelector(".mentor-status");
    const note = options.container.querySelector(".mentor-note");
    const buttons = Array.from(options.container.querySelectorAll("[data-intent]"));

    function render() {
      status.textContent = remoteEnabled() ? t("mentor.remote") : t("mentor.local");
      const locked = options.isExamRunning();
      buttons.forEach((btn) => {
        btn.textContent = t("mentor.btn." + btn.dataset.intent);
        btn.disabled = locked || busy;
      });
      note.textContent = locked ? t("mentor.examLocked") : t("mentor.penaltyNote");
      note.classList.toggle("is-locked", locked);
      log.innerHTML = messages.map((m) => {
        const text = m.key ? t(m.key) : m.text;
        return `<div class="msg msg-${m.role}${m.pending ? " is-pending" : ""}">${esc(text)}</div>`;
      }).join("");
      log.scrollTop = log.scrollHeight;
    }

    async function ask(intent) {
      if (!INTENTS.includes(intent) || busy) return;
      if (options.isExamRunning()) {
        toast(t("mentor.examLocked"), "warn");
        return;
      }
      const ctx = options.getContext();
      const localAnswer = RULES[options.lab][intent](ctx);
      if (PENALIZED_INTENTS.includes(intent)) options.onHint();
      messages.push({ role: "user", key: "mentor.btn." + intent });

      if (!remoteEnabled()) {
        messages.push({ role: "mentor", text: localAnswer });
        render();
        return localAnswer;
      }

      const pending = { role: "mentor", key: "mentor.thinking", pending: true };
      messages.push(pending);
      busy = true;
      render();
      let answer;
      try {
        answer = await askRemote({
          intent, lab: options.lab, lang: SIL.getLang(),
          context: summarizeContext(options.lab, ctx), localAnswer
        });
      } catch (error) {
        answer = t("mentor.remoteFail") + "\n" + localAnswer;
      }
      messages.splice(messages.indexOf(pending), 1, { role: "mentor", text: answer });
      busy = false;
      render();
      return answer;
    }

    function reset() {
      messages.splice(0, messages.length, { role: "mentor", key: "mentor.greeting" });
      render();
    }

    options.container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-intent]");
      if (button) ask(button.dataset.intent);
    });

    render();
    return { render, ask, reset, lastMessage: () => messages[messages.length - 1] };
  }

  // ===================== Страница «AI Mentor» =====================
  function initPage() {
    const select = document.getElementById("mentor-component");
    const button = document.getElementById("mentor-explain-btn");
    const output = document.getElementById("mentor-explain-out");
    const statusBox = document.getElementById("mentor-endpoint-status");
    if (!select) return;

    function renderPage() {
      const current = select.value;
      const pcOptions = PE.COMPONENTS.map((c) => `<option value="pc:${c.id}">${SIL.ui.esc(c.name)} — ${SIL.ui.esc(t("pc.slots." + c.slot))}</option>`).join("");
      const iotOptions = IE.COMPONENTS.map((c) => `<option value="iot:${c.id}">${SIL.ui.esc(IE.compName(c.id))}</option>`).join("");
      select.innerHTML = `<optgroup label="${SIL.ui.esc(t("mentorPage.groupPc"))}">${pcOptions}</optgroup>` +
        `<optgroup label="${SIL.ui.esc(t("mentorPage.groupIot"))}">${iotOptions}</optgroup>`;
      if (current) select.value = current;
      statusBox.textContent = remoteEnabled() ? t("mentorPage.statusRemote") : t("mentorPage.statusLocal");
      if (output.dataset.value) output.textContent = explainById(output.dataset.value);
    }

    function explainById(value) {
      const [lab, id] = value.split(":");
      return lab === "pc" ? explainPcComponent(PE.byId[id]) : explainIotComponent(id);
    }

    button.addEventListener("click", () => {
      output.dataset.value = select.value;
      output.textContent = explainById(select.value);
      output.hidden = false;
    });
    document.addEventListener("sil:lang", renderPage);
    renderPage();
  }

  SIL.Mentor = { create, rules: RULES, explainPcComponent, explainIotComponent, summarizeContext };
  SIL.MentorPage = { init: initPage };
})();
