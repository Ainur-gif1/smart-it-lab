/* Classroom worksheets. Simulator scores and student self-checks stay separate. */
(function () {
  'use strict';
  const SIL = window.SIL;
  const { esc, download } = SIL.ui;
  const KEY = 'smartitlab.practice.v1';
  const words = {
    ru: {
      nav: 'Практическое занятие', title: 'От задания — к работающей системе',
      lead: '45 минут · индивидуально или в парах · выберите одну лабораторную работу',
      plan: 'План занятия', stages: ['5 мин — цель и инструктаж', '5 мин — изучение требований', '25 мин — сборка и проверка', '10 мин — отчёт и защита'],
      task: 'Лабораторная работа', code: 'Код студента / группы (без ФИО)', goal: 'Результат обучения', steps: 'Порядок выполнения',
      open: 'Открыть выбранный симулятор', back: 'После проверки вернитесь в «Практическое занятие» и заполните отчёт.',
      check: 'Самопроверка', checks: ['Я выполнил требования задания', 'Я проверил результат в симуляторе', 'Я могу объяснить выбор компонентов и исправление ошибок'],
      note: 'Самопроверка не начисляет баллы. Результат симулятора сохраняется отдельно.',
      evidence: 'Наблюдения и результаты проверки', evidenceHint: 'Укажите комплектующие / GPIO, проверенные значения и полученный результат.',
      errors: 'Какая ошибка возникла и как вы её исправили?', conclusion: 'Вывод: чему вы научились?', questions: 'Вопросы для защиты',
      rubric: 'Как оценивается работа', rubricText: 'Симулятор: до 100 баллов по его таблице критериев. Ошибка: −5, подсказка: −3. Полноту отчёта и устную защиту оценивает преподаватель отдельно.',
      result: 'Последняя попытка в симуляторе', none: 'Попыток пока нет. Завершите работу в симуляторе.',
      old: 'Это последняя сохранённая попытка; проверьте дату. Она могла быть выполнена до текущего занятия.',
      score: 'Баллы', date: 'Дата', mode: 'Режим', status: 'Выполнено', yes: 'Да', no: 'Нет',
      export: 'Скачать отчёт (JSON)', print: 'Печать / PDF', local: 'Черновик сохраняется в этом браузере. Для передачи преподавателю скачайте JSON или распечатайте отчёт. Автоматической отправки нет.',
      saved: 'Черновик сохранён', failed: 'Не удалось сохранить черновик. Скачайте отчёт перед закрытием страницы.',
      incomplete: 'Заполните код, наблюдения, исправление ошибок (или «ошибок не было») и вывод перед выгрузкой.',
      safety: 'Учебная модель: цены и параметры упрощены. В IoT показаны сигнальные соединения; питание, резисторы и силовые драйверы нужно изучать отдельно перед работой с оборудованием.',
      teacher: 'Преподавателю', teacherText: 'Попросите студентов прислать JSON-отчёты. Кнопка ниже объединяет выбранные файлы в таблицу на этом устройстве. Результаты локальные, это не защищённая экзаменационная система.',
      import: 'Открыть отчёты студентов (JSON)', invalid: 'Часть файлов не прочитана: неверный формат, слишком большой файл или отсутствующие поля.', loaded: 'Прочитано отчётов:',
      empty: 'Отчёты ещё не выбраны.', warning: 'Сначала сохраните свою текущую сборку: при смене задания симулятор запросит подтверждение.'
    },
    kz: {
      nav: 'Практикалық сабақ', title: 'Тапсырмадан — жұмыс істейтін жүйеге',
      lead: '45 минут · жеке немесе жұппен · бір зертханалық жұмысты таңдаңыз',
      plan: 'Сабақ жоспары', stages: ['5 мин — мақсат және нұсқаулық', '5 мин — талаптармен танысу', '25 мин — құрастыру және тексеру', '10 мин — есеп және қорғау'],
      task: 'Зертханалық жұмыс', code: 'Студент / топ коды (аты-жөнінсіз)', goal: 'Оқу нәтижесі', steps: 'Орындау реті',
      open: 'Таңдалған симуляторды ашу', back: 'Тексергеннен кейін «Практикалық сабақ» бөліміне оралып, есепті толтырыңыз.',
      check: 'Өзін-өзі тексеру', checks: ['Тапсырма талаптарын орындадым', 'Нәтижені симуляторда тексердім', 'Компоненттерді таңдауымды және қатені түзетуді түсіндіре аламын'],
      note: 'Өзін-өзі тексеру ұпай қоспайды. Симулятор нәтижесі бөлек сақталады.',
      evidence: 'Бақылау және тексеру нәтижелері', evidenceHint: 'Компоненттерді / GPIO, тексерілген мәндер мен алынған нәтижені жазыңыз.',
      errors: 'Қандай қате болды және оны қалай түзеттіңіз?', conclusion: 'Қорытынды: не үйрендіңіз?', questions: 'Қорғау сұрақтары',
      rubric: 'Жұмысты бағалау', rubricText: 'Симулятор: өз критерийлері бойынша 100 ұпайға дейін. Қате: −5, көмек: −3. Есептің толықтығын және ауызша қорғауды оқытушы бөлек бағалайды.',
      result: 'Симулятордағы соңғы әрекет', none: 'Әзірше нәтиже жоқ. Симулятордағы жұмысты аяқтаңыз.',
      old: 'Бұл — соңғы сақталған әрекет; күнін тексеріңіз. Ол осы сабаққа дейін орындалған болуы мүмкін.',
      score: 'Ұпай', date: 'Күні', mode: 'Режим', status: 'Орындалды', yes: 'Иә', no: 'Жоқ',
      export: 'Есепті жүктеу (JSON)', print: 'Басып шығару / PDF', local: 'Жоба осы браузерде сақталады. Оқытушыға беру үшін JSON жүктеңіз немесе есепті басып шығарыңыз. Автоматты түрде жіберілмейді.',
      saved: 'Жоба сақталды', failed: 'Жобаны сақтау мүмкін болмады. Бетті жаппас бұрын есепті жүктеңіз.',
      incomplete: 'Жүктеу алдында кодты, бақылауды, қатені түзетуді (немесе «қате болған жоқ») және қорытындыны толтырыңыз.',
      safety: 'Оқу моделі: бағалар мен параметрлер жеңілдетілген. IoT тек сигналдық байланыстарды көрсетеді; нақты жабдықпен жұмыс алдында қорек, резисторлар және қуат драйверлерін бөлек қарастырыңыз.',
      teacher: 'Оқытушыға', teacherText: 'Студенттерден JSON есептерін сұраңыз. Төмендегі батырма таңдалған файлдарды осы құрылғыда кестеге біріктіреді. Нәтижелер жергілікті сақталады, бұл қорғалған емтихан жүйесі емес.',
      import: 'Студент есептерін ашу (JSON)', invalid: 'Кейбір файлдар оқылмады: пішімі қате, көлемі тым үлкен немесе міндетті өрістер жоқ.', loaded: 'Оқылған есептер:',
      empty: 'Есептер әлі таңдалмады.', warning: 'Алдымен ағымдағы жұмысыңызды сақтаңыз: тапсырма өзгерсе, симулятор растауды сұрайды.'
    }
  };
  Object.entries(words).forEach(([lang, value]) => { SIL.I18N[lang].practice = value; });
  const data = {
    ru: [
      ['Подобрать совместимый офисный ПК в пределах $500 без дискретной видеокарты.', ['Откройте PC Builder: офисный ПК, режим обучения.', 'Сопоставьте сокет процессора и платы, тип памяти и охлаждение.', 'Установите обязательные компоненты, проверьте бюджет и встроенную графику.', 'Проверьте сборку и запустите ПК. В отчёте укажите стоимость и результат POST.'], ['Почему можно обойтись без отдельной видеокарты?', 'Как вы проверили совместимость CPU и RAM?']],
      ['Собрать игровой ПК с GPU от 220 W и RAM от 16 GB.', ['Выберите игровое задание в PC Builder.', 'Подберите совместимые плату, CPU, память и охлаждение.', 'Добавьте GPU и накопитель. Проверьте мощность БП с запасом, который использует модель.', 'Запустите ПК. Запишите мощность нагрузки, БП и результат проверки.'], ['Почему недостаточно проверить только мощность GPU?', 'Что произойдёт при несовпадении типа DDR?']],
      ['Собрать рабочую станцию: не менее 8 ядер, 32 GB RAM и SSD 1 TB.', ['Выберите рабочую станцию в PC Builder.', 'Подберите CPU с нужным числом ядер и совместимую плату.', 'Установите RAM, SSD, охлаждение и БП; проверьте видеовыход.', 'Выполните проверку и POST, обоснуйте выбор CPU и памяти.'], ['Чем требования отличаются от офисного ПК?', 'Когда потребуется отдельная видеокарта?']],
      ['Создать автоматическое освещение и проверить границу 300 лк.', ['Выберите освещение в IoT Lab; добавьте ESP32, датчик света и LED.', 'Назначьте датчику вход ADC1, а LED — выходной GPIO; проверьте схему.', 'Проверьте 290, 300 и 310 лк. Запишите состояния LED: ON, OFF, OFF.', 'Наблюдайте оба состояния, сохраните результат и объясните условие light < 300.'], ['Почему датчику нужен АЦП?', 'Почему при 300 лк LED выключен?']],
      ['Создать управление вентилятором по температуре и проверить порог 28 °C.', ['Выберите температуру в IoT Lab; добавьте ESP32, DHT22 и вентилятор.', 'Назначьте различные цифровые GPIO; выход вентилятора не должен быть input-only.', 'Проверьте схему и температуры 27, 28, 29 °C: OFF, OFF, ON.', 'Сохраните результат и объясните роль драйвера при подключении реального вентилятора.'], ['Чем цифровой датчик отличается от аналогового?', 'Почему GPIO34 не подходит для управления вентилятором?']],
      ['Создать сигнализацию движения и проверить два состояния.', ['Выберите движение в IoT Lab; добавьте ESP32, PIR и буззер.', 'Подключите датчик и буззер к разным подходящим GPIO.', 'Проверьте схему; переключите движение: нет → есть → нет.', 'Запишите состояния буззера OFF → ON → OFF и сохраните результат.'], ['Почему нельзя назначить двум модулям один GPIO?', 'Какое условие включает сигнал?']]
    ],
    kz: [
      ['$500 шегінде дискретті видеокартасыз үйлесімді кеңселік ПК құрастыру.', ['PC Builder бөлімінде кеңселік ПК мен оқу режимін таңдаңыз.', 'Процессор мен платаның сокетін, жад түрі мен салқындатуды салыстырыңыз.', 'Міндетті компоненттерді орнатып, бюджетті және кіріктірілген графиканы тексеріңіз.', 'Құрастырманы тексеріп, ПК іске қосыңыз. Есепке құны мен POST нәтижесін жазыңыз.'], ['Неліктен бөлек видеокартасыз жұмыс істеуге болады?', 'CPU мен RAM үйлесімділігін қалай тексердіңіз?']],
      ['GPU қуаты кемінде 220 W және RAM кемінде 16 GB болатын ойын ПК құрастыру.', ['PC Builder бөлімінен ойын тапсырмасын таңдаңыз.', 'Үйлесімді плата, CPU, жад және салқындату таңдаңыз.', 'GPU мен жинақтауыш қосыңыз. Модельдегі қорды ескеріп, қорек блогын тексеріңіз.', 'ПК іске қосыңыз. Жүктеме қуатын, қорек блогын және тексеру нәтижесін жазыңыз.'], ['Неге тек GPU қуатын тексеру жеткіліксіз?', 'DDR түрлері сәйкес келмесе не болады?']],
      ['Кемінде 8 ядро, 32 GB RAM және SSD 1 TB бар жұмыс станциясын құрастыру.', ['PC Builder бөлімінен жұмыс станциясын таңдаңыз.', 'Ядро саны жеткілікті CPU және үйлесімді плата таңдаңыз.', 'RAM, SSD, салқындату мен қорек блогын орнатып, бейнешығысты тексеріңіз.', 'Тексеру мен POST орындаңыз, CPU және жад таңдауын негіздеңіз.'], ['Талаптары кеңселік ПК-дан қалай ерекшеленеді?', 'Бөлек видеокарта қашан қажет?']],
      ['Автоматты жарықтандыруды құрып, 300 лк шегін тексеру.', ['IoT Lab бөлімінде жарықтандыруды таңдап, ESP32, жарық датчигі және LED қосыңыз.', 'Датчикке ADC1 кірісін, LED-ке шығыс GPIO тағайындап, схеманы тексеріңіз.', '290, 300 және 310 лк мәндерін тексеріңіз. LED күйлері: ON, OFF, OFF.', 'Екі күйді бақылап, нәтижені сақтаңыз және light < 300 шартын түсіндіріңіз.'], ['Датчикке АЦТ неге қажет?', '300 лк кезінде LED неге өшеді?']],
      ['Желдеткішті температурамен басқарып, 28 °C шегін тексеру.', ['IoT Lab бөлімінде температураны таңдап, ESP32, DHT22 және желдеткіш қосыңыз.', 'Әртүрлі цифрлық GPIO таңдаңыз; желдеткіш шығысы input-only болмауы керек.', 'Схеманы және 27, 28, 29 °C мәндерін тексеріңіз: OFF, OFF, ON.', 'Нәтижені сақтап, нақты желдеткішті қосуда драйвердің рөлін түсіндіріңіз.'], ['Цифрлық және аналогтық датчиктің айырмашылығы қандай?', 'Неге GPIO34 желдеткішті басқаруға жарамайды?']],
      ['Қозғалыс дабылын құрып, екі күйін тексеру.', ['IoT Lab бөлімінде қозғалысты таңдап, ESP32, PIR және буззер қосыңыз.', 'Датчик пен буззерді әртүрлі жарамды GPIO-ға жалғаңыз.', 'Схеманы тексеріп, қозғалысты ауыстырыңыз: жоқ → бар → жоқ.', 'Буззер күйлерін OFF → ON → OFF деп жазып, нәтижені сақтаңыз.'], ['Неге екі модульге бір GPIO тағайындауға болмайды?', 'Дабылды қандай шарт іске қосады?']]
    ]
  };
  let state = { task: SIL.TASKS[0].id, code: '', sheets: {} };
  let imported = [];
  let storageOk = true;
  const w = () => words[SIL.getLang()];
  const task = () => SIL.TASKS.find(t => t.id === state.task);
  const sheet = () => state.sheets[state.task] || (state.sheets[state.task] = { checks: [false, false, false], evidence: '', errors: '', conclusion: '' });
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
    catch (_) { storageOk = false; }
    const el = document.getElementById('practice-save');
    if (el) el.textContent = storageOk ? w().saved : w().failed;
  }
  function resultHtml(entry) {
    if (!entry) return `<p>${esc(w().none)}</p>`;
    return `<p>${esc(w().score)}: <strong>${esc(entry.lastScore)} / 100</strong></p><p>${esc(w().date)}: ${esc(SIL.ui.formatDate(entry.lastDate))} · ${esc(w().mode)}: ${esc(SIL.t('common.' + entry.lastMode))}</p>`;
  }
  function render() {
    const a = w(), s = sheet(), i = SIL.TASKS.indexOf(task()), lesson = data[SIL.getLang()][i];
    const field = (id, label, hint = '') => `<label class="worksheet-label" for="practice-${id}">${esc(label)}</label>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<textarea id="practice-${id}" data-sheet="${id}" rows="3" maxlength="6000">${esc(s[id])}</textarea><div class="practice-print-answer">${esc(s[id])}</div>`;
    document.getElementById('practice-content').innerHTML = `
      <div class="page-head"><p class="practice-eyebrow">SMART IT LAB / ${esc(a.nav)}</p><h1 id="practice-title">${esc(a.title)}</h1><p class="lead">${esc(a.lead)}</p></div>
      <section class="panel"><h2 class="panel-title">${esc(a.plan)}</h2><ol class="practice-plan">${a.stages.map(v => `<li>${esc(v)}</li>`).join('')}</ol></section>
      <section class="panel"><label class="worksheet-label" for="practice-task">${esc(a.task)}</label><select id="practice-task">${SIL.TASKS.map(t => `<option value="${t.id}" ${t.id === state.task ? 'selected' : ''}>${esc(SIL.t(t.titleKey))}</option>`).join('')}</select>
      <label class="worksheet-label" for="practice-code">${esc(a.code)}</label><input id="practice-code" maxlength="60" autocomplete="off" value="${esc(state.code)}">
      <h2 class="panel-title spaced">${esc(a.goal)}</h2><p>${esc(lesson[0])}</p><h2 class="panel-title spaced">${esc(a.steps)}</h2><ol class="nice-list">${lesson[1].map(v => `<li>${esc(v)}</li>`).join('')}</ol>
      <button class="btn btn-primary practice-no-print" id="practice-open" type="button">${esc(a.open)} →</button><p class="hint">${esc(a.back)}</p><p class="note practice-no-print">${esc(a.warning)}</p></section>
      <section class="panel"><h2 class="panel-title">${esc(a.check)}</h2>${a.checks.map((v, n) => `<label class="practice-check"><input type="checkbox" data-check="${n}" ${s.checks[n] ? 'checked' : ''}> ${esc(v)}</label>`).join('')}<p class="hint">${esc(a.note)}</p>
      ${field('evidence', a.evidence, a.evidenceHint)}${field('errors', a.errors)}${field('conclusion', a.conclusion)}<p id="practice-save" role="status">${esc(storageOk ? a.saved : a.failed)}</p></section>
      <section class="panel"><h2 class="panel-title">${esc(a.questions)}</h2><ol class="nice-list">${lesson[2].map(v => `<li>${esc(v)}</li>`).join('')}</ol><h2 class="panel-title spaced">${esc(a.rubric)}</h2><p>${esc(a.rubricText)}</p><h2 class="panel-title spaced">${esc(a.result)}</h2><div id="practice-result">${resultHtml(SIL.Progress.get(state.task))}</div><p class="hint">${esc(a.old)}</p></section>
      <div class="btn-row practice-no-print"><button type="button" class="btn btn-primary" id="practice-export">${esc(a.export)}</button><button type="button" class="btn" id="practice-print">${esc(a.print)}</button></div><p class="note practice-no-print">${esc(a.local)}</p><p class="note">${esc(a.safety)}</p>`;
    document.getElementById('practice-task').addEventListener('change', e => { state.task = e.target.value; save(); render(); });
    document.getElementById('practice-code').addEventListener('input', e => { state.code = e.target.value; save(); });
    document.querySelectorAll('[data-sheet]').forEach(el => el.addEventListener('input', () => { sheet()[el.dataset.sheet] = el.value; el.nextElementSibling.textContent = el.value; save(); }));
    document.querySelectorAll('[data-check]').forEach(el => el.addEventListener('change', () => { sheet().checks[Number(el.dataset.check)] = el.checked; save(); }));
    document.getElementById('practice-open').addEventListener('click', () => {
      const t = task();
      if (t.lab === 'pc') SIL.PcBuilder.switchTask(t.id); else SIL.IotLab.switchProject(t.id);
      const activeId = t.lab === 'pc' ? SIL.PcBuilder.state.taskId : SIL.IotLab.state.projectId;
      if (activeId === t.id) location.hash = '#' + t.lab;
    });
    document.getElementById('practice-export').addEventListener('click', () => {
      const s = sheet();
      if (![state.code, s.evidence, s.errors, s.conclusion].every(v => v.trim())) { SIL.ui.toast(a.incomplete, 'info'); return; }
      download('smart-it-lab-report.json', JSON.stringify({ format: 'smartitlab-worksheet-v1', exportedAt: new Date().toISOString(), language: SIL.getLang(), taskId: state.task, studentCode: state.code, worksheet: s, simulator: SIL.Progress.get(state.task) }, null, 2), 'application/json');
    });
    document.getElementById('practice-print').addEventListener('click', () => window.print());
    renderTeacher();
  }
  function renderTeacher() {
    const a = w();
    const root = document.getElementById('practice-teacher');
    root.innerHTML = `<h2 class="panel-title">${esc(a.teacher)}</h2><p>${esc(a.teacherText)}</p><label for="practice-import" class="worksheet-label">${esc(a.import)}</label><input type="file" id="practice-import" accept=".json,application/json" multiple><p id="practice-import-status" role="status"></p><div class="table-wrap">${imported.length ? `<table class="data-table"><thead><tr><th>${esc(a.code)}</th><th>${esc(a.task)}</th><th>${esc(a.score)}</th><th>${esc(a.date)}</th></tr></thead><tbody>${imported.map(r => `<tr><td>${esc(r.studentCode)}</td><td>${esc(SIL.t(SIL.TASKS.find(t => t.id === r.taskId).titleKey))}</td><td>${r.simulator ? esc(r.simulator.lastScore) + ' / 100' : '—'}</td><td>${esc(SIL.ui.formatDate(r.exportedAt))}</td></tr>`).join('')}</tbody></table>` : `<p>${esc(a.empty)}</p>`}</div>`;
    document.getElementById('practice-import').addEventListener('change', async e => {
      const files = Array.from(e.target.files).slice(0, 100); let invalid = e.target.files.length > 100;
      const rows = [];
      for (const file of files) {
        try {
          if (file.size > 1000000) throw Error('size');
          const r = JSON.parse(await file.text());
          if (r.format !== 'smartitlab-worksheet-v1' || !SIL.TASKS.some(t => t.id === r.taskId) || typeof r.studentCode !== 'string' || r.studentCode.length > 60 || !r.worksheet || typeof r.exportedAt !== 'string' || Number.isNaN(Date.parse(r.exportedAt))) throw Error('format');
          if (r.simulator !== null && (!r.simulator || !Number.isFinite(r.simulator.lastScore) || r.simulator.lastScore < 0 || r.simulator.lastScore > 100)) throw Error('score');
          rows.push(r);
        } catch (_) { invalid = true; }
      }
      imported = rows; renderTeacher();
      document.getElementById('practice-import-status').textContent = `${w().loaded} ${rows.length}. ${invalid ? w().invalid : ''}`;
    });
  }
  function init() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && SIL.TASKS.some(t => t.id === saved.task) && typeof saved.code === 'string' && saved.sheets && typeof saved.sheets === 'object') {
        state.task = saved.task; state.code = saved.code.slice(0, 60);
        for (const t of SIL.TASKS) {
          const s = saved.sheets[t.id];
          if (s && ['evidence', 'errors', 'conclusion'].every(k => typeof s[k] === 'string') && Array.isArray(s.checks)) state.sheets[t.id] = { evidence: s.evidence.slice(0, 6000), errors: s.errors.slice(0, 6000), conclusion: s.conclusion.slice(0, 6000), checks: [0, 1, 2].map(i => s.checks[i] === true) };
        }
      }
    } catch (_) { /* Invalid or unavailable storage: start with an empty worksheet. */ }
    const teacher = document.createElement('section'); teacher.id = 'practice-teacher'; teacher.className = 'panel';
    document.querySelector('[data-page="teacher"] .page-head').after(teacher);
    document.addEventListener('sil:lang', render);
    document.addEventListener('sil:progress', () => {
      const el = document.getElementById('practice-result');
      if (el) el.innerHTML = resultHtml(SIL.Progress.get(state.task));
    });
    render();
  }
  SIL.Practice = { init };
})();
