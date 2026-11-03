# Тексеру есебі

Автоматты JavaScript логикасы және жеңіл DOM моделімен интеграциялық тексеру. Нақты браузер сынағы емес.

Нәтиже: 24/24.

| № | Тексеру | Күйі |
|---|---|---|
| 1 | Complete application initializes with Kazakh as the default | PASS |
| 2 | Valid light circuit validates, starts, stops and resumes | PASS |
| 3 | Light 290 ON, 300 OFF and 310 OFF; once-only result recording | PASS |
| 4 | Invalid output GPIO prevents simulation and explains in Kazakh | PASS |
| 5 | Unknown pin, ADC mismatch, duplicate pin and DHT input-only rejection | PASS |
| 6 | Editing a validated or completed circuit invalidates simulation and result | PASS |
| 7 | Restart resets observations and sensor value; completed restart starts new attempt | PASS |
| 8 | Component removal invalidates, then re-add and rewire runs again | PASS |
| 9 | Temperature 27 and 28 OFF, 29 ON | PASS |
| 10 | Motion false OFF, true ON, false OFF | PASS |
| 11 | Non-finite sensor input is ignored; out-of-range input is clamped | PASS |
| 12 | Language switching preserves running circuit and observations | PASS |
| 13 | Exam helper locked; attempt saved only on finish, then immutable | PASS |
| 14 | PC office, gaming and workstation produce correct POST and once-only records | PASS |
| 15 | PC socket, DDR, cooling, PSU and task conditions are validated | PASS |
| 16 | PC edit after a saved result produces a new attempt ID | PASS |
| 17 | Per-attempt student code, date and check result persist across reload | PASS |
| 18 | Blocked storage keeps records in memory and displays warning | PASS |
| 19 | JSON export and duplicate import round-trip without changing own progress | PASS |
| 20 | Invalid JSON, oversized files, invalid scores and conflicting IDs are rejected atomically | PASS |
| 21 | Untrusted names render escaped and CSV formula cells are neutralized | PASS |
| 22 | Report draft saves, exports with the attempt and rejects oversized values | PASS |
| 23 | All six bilingual lessons have no unresolved translation keys; exam omits steps | PASS |
| 24 | All HTML assets are local and present, and every script parses | PASS |

Жергілікті HTTP сервер: PASS. index.html және 16 жергілікті ресурс HTTP 200 арқылы берілді, JavaScript MIME тексерілді. Бұл нақты браузер сынағы емес. Хаттама: tests/server-results.json.

Браузер, мобильді көрініс, print/PDF, браузер консолі және нақты offline іске қосу: ОРЫНДАЛМАҒАН. Себеп: managed preview daemon қолжетімсіз.

Студенттік апробация: ӨТКІЗІЛМЕГЕН. Нақты студенттік немесе педагогикалық нәтиже туралы статистика жоқ.

Қайта тексеру: `node tests/classroom.test.cjs --write`. Нақты браузерде `docs/DEMO_KK.md` қадамдарын орындаңыз.
