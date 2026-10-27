const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
process.chdir(require('path').resolve(__dirname, '..'));
const nodes = new Map(), listeners = {};
class Element {
 constructor() { this.listeners = {}; this.dataset = {}; this.value = ''; this.nextElementSibling = { textContent: '' }; }
 set innerHTML(v) {
  this.html = v;
  for (const match of v.matchAll(/<(?:input|select|textarea|button|div|p)[^>]*\bid="([^"]+)"[^>]*>/g)) {
   const el = new Element(); el.id = match[1]; nodes.set(el.id, el);
   const val = match[0].match(/value="([^"]*)"/); if (val) el.value = val[1];
  }
 }
 get innerHTML() { return this.html; }
 addEventListener(type, fn) { this.listeners[type] = fn; }
 after() {}
}
for (const id of ['practice-content','practice-teacher']) nodes.set(id, new Element());
const document = { getElementById: id => nodes.get(id), querySelectorAll: () => [], querySelector: () => new Element(), createElement: () => new Element(), addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }, dispatchEvent: event => (listeners[event.type] || []).forEach(fn => fn(event)) };
const memory = {};
const context = { window: {}, document, localStorage: { getItem: k => memory[k] || null, setItem: (k,v) => memory[k] = v, removeItem: k => delete memory[k] }, CustomEvent: class { constructor(type) { this.type = type; } }, console, setTimeout, location: {} };
context.window.SIL = {}; vm.createContext(context);
for (const file of ['translations','ui','progress','pc-engine','iot-engine','practice']) vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), context);
const SIL = context.window.SIL;
SIL.PcBuilder = { state: { taskId: 'pc-office' }, switchTask(id) { this.state.taskId = id; } };
SIL.IotLab = { state: { projectId: 'iot-light' }, switchProject(id) { this.state.projectId = id; } };
SIL.Practice.init();
assert.match(nodes.get('practice-content').html, /45 минут/);
const changeTask = id => nodes.get('practice-task').listeners.change({target:{value:id}});
for (const lang of ['ru', 'kz']) {
 SIL.setLang(lang); document.dispatchEvent({type:'sil:lang'});
 for (const task of SIL.TASKS) { changeTask(task.id); assert(!nodes.get('practice-content').html.includes('undefined')); nodes.get('practice-open').listeners.click(); assert.equal(context.location.hash, '#' + task.lab); }
}
// Cancellation preserves the worksheet route.
changeTask('pc-gaming'); SIL.PcBuilder.state.taskId='pc-office'; SIL.PcBuilder.switchTask = () => {}; context.location.hash='#practice'; nodes.get('practice-open').listeners.click(); assert.equal(context.location.hash, '#practice');
// Draft survives reinitialization and separate task selection.
nodes.get('practice-code').listeners.input({target:{value:'IT-21'}}); changeTask('pc-office'); SIL.Practice.init(); assert.equal(nodes.get('practice-code').value, 'IT-21');
// A saved simulator result refreshes the worksheet without overwriting the form.
SIL.Progress.recordAttempt('pc-office', {score:87, completed:true, mistakes:2, hints:1, timeSec:300, mode:'learn'});
assert.match(nodes.get('practice-result').html, /87/);
// Teacher imports valid reports and safely escapes student-controlled HTML.
(async () => {
 const report = {format:'smartitlab-worksheet-v1', taskId:'pc-office', studentCode:'<script>bad</script>', worksheet:{}, exportedAt:new Date().toISOString(), simulator:{lastScore:87}};
 const file = body => ({size:body.length, text:async()=>body});
 await nodes.get('practice-import').listeners.change({target:{files:[file(JSON.stringify(report)), file('{bad'), file(JSON.stringify({...report,simulator:{lastScore:500}}))]}});
 assert.match(nodes.get('practice-teacher').html, /&lt;script&gt;/);
 assert.equal((nodes.get('practice-teacher').html.match(/87 \/ 100/g)||[]).length,1);
 assert.match(nodes.get('practice-import-status').textContent,/1/);
 // Boundary expectations documented by the lessons match the simulator.
 assert.equal(SIL.IotEngine.getProject('iot-light').isOn(290),true);
 assert.equal(SIL.IotEngine.getProject('iot-light').isOn(300),false);
 assert.equal(SIL.IotEngine.getProject('iot-temp').isOn(28),false);
 assert.equal(SIL.IotEngine.getProject('iot-temp').isOn(29),true);
 console.log('PASS: 12 bilingual lesson views, navigation/cancellation, persisted draft, simulator refresh, report import validation/escaping, IoT boundaries');
})().catch(e=>{console.error(e);process.exitCode=1;});
