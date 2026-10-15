/*
 * PC Builder: данные комплектующих, задания и правила совместимости.
 * Файл не работает с DOM — только логика, поэтому его легко проверять и расширять.
 */
(function (root) {
  "use strict";
  const SIL = (root.SIL = root.SIL || {});
  const t = (...args) => SIL.t(...args);

  const SLOTS = ["motherboard", "cpu", "cooler", "ram", "gpu", "storage", "psu"];
  const REQUIRED_SLOTS = ["motherboard", "cpu", "cooler", "ram", "storage", "psu"];
  const MOUNTED_ON_BOARD = ["cpu", "cooler", "ram", "gpu", "storage"];
  const BASE_POWER_W = 60; // плата, память, накопитель, вентиляторы
  const PSU_HEADROOM = 1.1; // запас мощности блока питания 10 %

  const COMPONENTS = [
    { id: "mb-a", slot: "motherboard", name: "Board A", socket: "AM4", ramType: "DDR4", price: 90 },
    { id: "mb-b", slot: "motherboard", name: "Board B", socket: "LGA1700", ramType: "DDR4", price: 110 },
    { id: "mb-c", slot: "motherboard", name: "Board C", socket: "LGA1700", ramType: "DDR5", price: 150 },

    { id: "cpu-r5", slot: "cpu", name: "Ryzen 5 5600G", socket: "AM4", cores: 6, tdp: 65, igpu: true, price: 130 },
    { id: "cpu-r7", slot: "cpu", name: "Ryzen 7 5800X", socket: "AM4", cores: 8, tdp: 105, igpu: false, price: 200 },
    { id: "cpu-i5", slot: "cpu", name: "Intel Core i5-12400", socket: "LGA1700", cores: 6, tdp: 65, igpu: true, price: 150 },
    { id: "cpu-i7", slot: "cpu", name: "Intel Core i7-12700", socket: "LGA1700", cores: 12, tdp: 125, igpu: true, price: 280 },

    { id: "cool-box", slot: "cooler", name: "Box Cooler", maxTdp: 95, price: 15 },
    { id: "cool-tower", slot: "cooler", name: "Tower Cooler", maxTdp: 200, price: 40 },

    { id: "ram-8", slot: "ram", name: "8 GB DDR4", ramType: "DDR4", sizeGb: 8, price: 25 },
    { id: "ram-16", slot: "ram", name: "16 GB DDR4", ramType: "DDR4", sizeGb: 16, price: 45 },
    { id: "ram-32", slot: "ram", name: "32 GB DDR4", ramType: "DDR4", sizeGb: 32, price: 80 },
    { id: "ram-32d5", slot: "ram", name: "32 GB DDR5", ramType: "DDR5", sizeGb: 32, price: 110 },

    { id: "gpu-low", slot: "gpu", name: "Low GPU", power: 120, price: 150 },
    { id: "gpu-gaming", slot: "gpu", name: "Gaming GPU", power: 220, price: 350 },
    { id: "gpu-power", slot: "gpu", name: "Power GPU", power: 320, price: 650 },

    { id: "ssd-256", slot: "storage", name: "SSD 256 GB SATA", sizeGb: 256, price: 30 },
    { id: "ssd-1tb", slot: "storage", name: "SSD 1 TB NVMe", sizeGb: 1000, price: 70 },

    { id: "psu-400", slot: "psu", name: "PSU 400 W", watt: 400, price: 40 },
    { id: "psu-550", slot: "psu", name: "PSU 550 W", watt: 550, price: 60 },
    { id: "psu-750", slot: "psu", name: "PSU 750 W", watt: 750, price: 95 }
  ];

  const byId = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]));

  // Каждое задание: базовые критерии (совместимость, питание) общие, условия — свои.
  const TASKS = [
    {
      id: "pc-office", key: "office", budget: 500,
      conditions: [
        { key: "pc.tasks.office.c1", tipKey: "pc.tasks.office.c1Tip", points: 10, test: (b, info) => info.price <= 500 },
        { key: "pc.tasks.office.c2", tipKey: "pc.tasks.office.c2Tip", points: 10, test: (b) => !b.gpu && Boolean(b.cpu && b.cpu.igpu) }
      ]
    },
    {
      id: "pc-gaming", key: "gaming",
      conditions: [
        { key: "pc.tasks.gaming.c1", tipKey: "pc.tasks.gaming.c1Tip", points: 10, test: (b) => Boolean(b.gpu && b.gpu.power >= 220) },
        { key: "pc.tasks.gaming.c2", tipKey: "pc.tasks.gaming.c2Tip", points: 10, test: (b) => Boolean(b.ram && b.ram.sizeGb >= 16) }
      ]
    },
    {
      id: "pc-work", key: "work",
      conditions: [
        { key: "pc.tasks.work.c1", tipKey: "pc.tasks.work.c1Tip", points: 10, test: (b) => Boolean(b.cpu && b.cpu.cores >= 8) },
        { key: "pc.tasks.work.c2", tipKey: "pc.tasks.work.c2Tip", points: 10, test: (b) => Boolean(b.ram && b.ram.sizeGb >= 32 && b.storage && b.storage.sizeGb >= 1000) }
      ]
    }
  ];

  const getTask = (taskId) => TASKS.find((task) => task.id === taskId) || TASKS[0];

  /** buildIds: { slot: componentId } → { slot: componentObject | null } */
  function resolveBuild(buildIds) {
    const build = {};
    SLOTS.forEach((slot) => {
      build[slot] = buildIds && buildIds[slot] ? byId[buildIds[slot]] || null : null;
    });
    return build;
  }

  function powerInfo(build) {
    const required = BASE_POWER_W + (build.cpu ? build.cpu.tdp : 0) + (build.gpu ? build.gpu.power : 0);
    const minWatt = required * PSU_HEADROOM;
    const psuOptions = COMPONENTS.filter((c) => c.slot === "psu").map((c) => c.watt).sort((a, b) => a - b);
    const recommended = psuOptions.find((w) => w >= minWatt) || Math.ceil(minWatt / 50) * 50;
    const psu = build.psu ? build.psu.watt : 0;
    return { required, minWatt, recommended, psu, enough: Boolean(build.psu) && psu >= minWatt };
  }

  function totalPrice(build) {
    return SLOTS.reduce((sum, slot) => sum + (build[slot] ? build[slot].price : 0), 0);
  }

  function analyze(buildIds, taskId) {
    const b = resolveBuild(buildIds);
    const task = getTask(taskId);
    const power = powerInfo(b);
    const price = totalPrice(b);
    const issues = [];

    if (b.cpu && b.motherboard && b.cpu.socket !== b.motherboard.socket) {
      issues.push({ level: "error", code: "socket", slots: ["cpu", "motherboard"],
        params: { cpu: b.cpu.name, cpuSocket: b.cpu.socket, mb: b.motherboard.name, mbSocket: b.motherboard.socket } });
    }
    if (b.ram && b.motherboard && b.ram.ramType !== b.motherboard.ramType) {
      issues.push({ level: "error", code: "ram", slots: ["ram", "motherboard"],
        params: { ram: b.ram.name, ramType: b.ram.ramType, mb: b.motherboard.name, mbRam: b.motherboard.ramType } });
    }
    if (b.cooler && b.cpu && b.cooler.maxTdp < b.cpu.tdp) {
      issues.push({ level: "error", code: "cooler", slots: ["cooler", "cpu"],
        params: { cooler: b.cooler.name, coolerTdp: b.cooler.maxTdp, cpu: b.cpu.name, cpuTdp: b.cpu.tdp } });
    }
    if (b.psu && !power.enough) {
      issues.push({ level: "error", code: "psu", slots: ["psu", "gpu"],
        params: { req: power.required, rec: power.recommended, psu: b.psu.watt } });
    }
    if (b.cpu && !b.gpu && !b.cpu.igpu) {
      issues.push({ level: "error", code: "video", slots: ["gpu", "cpu"], params: { cpu: b.cpu.name } });
    }
    REQUIRED_SLOTS.forEach((slot) => {
      if (!b[slot]) issues.push({ level: "error", code: "missing", slots: [slot], params: { slot } });
    });

    const requiredInstalled = REQUIRED_SLOTS.filter((slot) => b[slot]).length;
    const allRequired = requiredInstalled === REQUIRED_SLOTS.length;
    const conditions = task.conditions.map((c) => ({
      key: c.key, tipKey: c.tipKey, points: c.points, met: allRequired && c.test(b, { price })
    }));
    const errors = issues.filter((issue) => issue.level === "error");
    const compat = {
      socket: Boolean(b.cpu && b.motherboard && b.cpu.socket === b.motherboard.socket),
      ram: Boolean(b.ram && b.motherboard && b.ram.ramType === b.motherboard.ramType),
      cooler: Boolean(b.cooler && b.cpu && b.cooler.maxTdp >= b.cpu.tdp)
    };
    return {
      build: b, task, power, price, issues, errors, compat, conditions,
      requiredInstalled, allRequired,
      postOk: errors.length === 0,
      taskOk: errors.length === 0 && conditions.every((c) => c.met)
    };
  }

  /** Итоговый балл: максимум 100. Штрафы: ошибка −5, подсказка −3. */
  function score(analysis, { launched = false, mistakes = 0, hints = 0 } = {}) {
    const condMax = analysis.conditions.reduce((s, c) => s + c.points, 0);
    const parts = [
      { key: "required", max: 20, points: Math.round((20 * analysis.requiredInstalled) / REQUIRED_SLOTS.length) },
      { key: "socket", max: 10, points: analysis.compat.socket ? 10 : 0 },
      { key: "ram", max: 8, points: analysis.compat.ram ? 8 : 0 },
      { key: "cooler", max: 7, points: analysis.compat.cooler ? 7 : 0 },
      { key: "power", max: 15, points: analysis.power.enough ? 15 : 0 },
      { key: "conditions", max: condMax, points: analysis.conditions.reduce((s, c) => s + (c.met ? c.points : 0), 0) },
      { key: "launch", max: 20, points: launched && analysis.postOk ? 20 : 0 }
    ];
    const gained = parts.reduce((s, p) => s + p.points, 0);
    const penalty = mistakes * 5 + hints * 3;
    return { parts, gained, penalty, mistakes, hints, total: Math.max(0, Math.min(100, gained - penalty)), max: 100 };
  }

  /** Коды проблем совместимости — используются для подсчёта ошибочных установок. */
  function compatProblemCodes(buildIds, taskId) {
    return new Set(analyze(buildIds, taskId).issues
      .filter((i) => ["socket", "ram", "cooler", "psu"].includes(i.code))
      .map((i) => i.code));
  }

  function issueParams(issue) {
    const params = Object.assign({}, issue.params);
    if (issue.code === "missing") params.slot = t("pc.slots." + issue.params.slot);
    return params;
  }
  const describeIssue = (issue) => t("pc.issue." + issue.code, issueParams(issue));
  const describeFix = (issue) => t("pc.fix." + issue.code, issueParams(issue));

  /** Короткое описание характеристик для карточки компонента. */
  function specList(comp) {
    const s = (key) => t("pc.specs." + key);
    const list = [];
    switch (comp.slot) {
      case "motherboard": list.push(`${s("socket")} ${comp.socket}`, comp.ramType); break;
      case "cpu": list.push(comp.socket, `${comp.cores} ${s("cores")}`, `TDP ${comp.tdp} W`, comp.igpu ? s("igpu") : s("noIgpu")); break;
      case "cooler": list.push(`${s("maxTdp")} ${comp.maxTdp} W`); break;
      case "ram": list.push(comp.ramType, `${comp.sizeGb} GB`); break;
      case "gpu": list.push(`${s("power")} ${comp.power} W`); break;
      case "storage": list.push(comp.sizeGb >= 1000 ? "1 TB" : `${comp.sizeGb} GB`); break;
      case "psu": list.push(`${s("watt")} ${comp.watt} W`); break;
      default: break;
    }
    list.push(`$${comp.price}`);
    return list;
  }

  SIL.PcEngine = {
    SLOTS, REQUIRED_SLOTS, MOUNTED_ON_BOARD, COMPONENTS, TASKS, BASE_POWER_W, PSU_HEADROOM,
    byId, getTask, resolveBuild, analyze, score, powerInfo, totalPrice,
    compatProblemCodes, describeIssue, describeFix, specList
  };
})(typeof window !== "undefined" ? window : globalThis);
