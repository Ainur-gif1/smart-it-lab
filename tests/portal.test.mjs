import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {makeApp,wire}=createRequire(import.meta.url)('./classroom.test.cjs');
import assert from 'node:assert/strict';
import { handleApi,gradeAttempt } from '../lib/portal/core.mjs';
const sql=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const DB={prepare(query){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB,AUTH_PEPPER:'test-only-pepper-abcdefghijklmnopqrstuvwxyz-123456',TEACHER_EMAILS:'teacher1@example.test,teacher2@example.test,teacher3@example.test'};
const teacher=n=>({'oai-authenticated-user-id':'teacher-'+n,'oai-authenticated-user-email':`teacher${n}@example.test`});
async function call(path,method='GET',data,headers={}){const r=await handleApi(new Request('https://lab.example/api/'+path,{method,headers:{Origin:'https://lab.example','Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
let user,second,assignment,cookie,submission;
await test('Anonymous users cannot read teacher or student data',async()=>{assert.equal((await call('teacher/students')).status,401);assert.equal((await call('student/submissions')).status,401);});
await test('An authenticated but unlisted account has no teacher access',async()=>{assert.equal((await call('teacher/me','GET',undefined,{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test'})).status,403);});
await test('Teacher creates student; password is hashed and excluded from response',async()=>{const r=await call('teacher/students','POST',{username:'student-one',displayCode:'S01',groupCode:'G1',password:'1234'},teacher(1));assert.equal(r.status,201);user=r.data.student;assert(!JSON.stringify(r.data).includes('password'));assert(sql.prepare('SELECT password_hash FROM portal_students WHERE id=?').get(user.id).password_hash.startsWith('pbkdf2-sha256-v1$'));});
await test('Duplicate usernames and short passwords are rejected',async()=>{assert.equal((await call('teacher/students','POST',{username:'student-one',displayCode:'S01',password:'1234'},teacher(1))).status,409);assert.equal((await call('teacher/students','POST',{username:'student-new',displayCode:'S02',password:'123'},teacher(1))).status,400);});
await test('Login and first-login password change; old session is revoked',async()=>{const r=await call('student/login','POST',{username:'student-one',password:'1234'});assert.equal(r.status,200);assert(r.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Strict'));const old=r.cookie;assert.equal((await call('student/assignments','GET',undefined,{Cookie:old})).status,403);assert.equal((await call('student/password','POST',{oldPassword:'1234',newPassword:'123'},{Cookie:old})).status,400);const change=await call('student/password','POST',{oldPassword:'1234',newPassword:'5678'},{Cookie:old});assert.equal(change.status,200);cookie=change.cookie;assert.equal((await call('student/me','GET',undefined,{Cookie:old})).status,401);assert.equal((await call('student/me','GET',undefined,{Cookie:cookie})).data.student.mustChangePassword,false);});
await test('Cross-origin writes are rejected',async()=>{assert.equal((await call('student/logout','POST',{}, {Cookie:cookie,Origin:'https://evil.example'})).status,403);});
await test('Student and teacher roles cannot be escalated by client JSON',async()=>{assert.equal((await call('teacher/students','POST',{role:'teacher',teacherId:'teacher-1'}, {Cookie:cookie})).status,401);});
await test('Teachers see only their own students and assignments',async()=>{const r=await call('teacher/students','POST',{username:'student-two',displayCode:'S02',password:'temporary-password-2'},teacher(2));second=r.data.student;assert.equal((await call('teacher/students','GET',undefined,teacher(2))).data.students.length,1);assert.equal((await call('teacher/students/'+user.id+'/reset-password','POST',{password:'new-temporary-password'},teacher(2))).status,404);assignment=(await call('teacher/assignments','POST',{taskId:'iot-light',title:'Light test',mode:'learn',instruction:'Test'},teacher(1))).data.id;assert.equal((await call('student/assignments','GET',undefined,{Cookie:cookie})).data.assignments[0].id,assignment);assert.equal((await call('teacher/assignments','GET',undefined,teacher(2))).data.assignments.length,0);});
const attempt={id:'test-attempt-1',taskId:'iot-light',mode:'learn',mistakes:0,hints:0,timeSec:60,score:99999,teacherId:'teacher-2',studentId:'fake',snapshot:{type:'iot',controller:'esp32',modules:[{id:'light',pin:'GPIO34'},{id:'led',pin:'GPIO2'}],values:[290,300,310]},report:{evidence:'290: ON; 300,310: OFF',fixes:'No errors',conclusion:'Works'}};
await test('Server validates circuits and recomputes grade instead of trusting score',async()=>{const r=gradeAttempt(attempt);assert.equal(r.completed,true);assert.equal(r.score,100);const wrong=structuredClone(attempt);wrong.snapshot.modules[1].pin='GPIO34';assert.equal(gradeAttempt(wrong).completed,false);assert(gradeAttempt(wrong).score<100);});
await test('Submission is stored once, scoped to actual session and teacher',async()=>{const r=await call('student/submissions','POST',{assignmentId:assignment,attempt},{Cookie:cookie});assert.equal(r.status,201);assert.equal(r.data.simulatorScore,100);submission=r.data.id;const twice=await call('student/submissions','POST',{assignmentId:assignment,attempt},{Cookie:cookie});assert.equal(twice.data.id,submission);assert.equal(twice.data.duplicate,true);assert.equal(sql.prepare('SELECT count(*) AS n FROM portal_submissions').get().n,1);assert.equal((await call('teacher/submissions','GET',undefined,teacher(2))).data.submissions.length,0);});
await test('Cross-teacher work detail and review are denied',async()=>{assert.equal((await call('teacher/submissions/'+submission,'GET',undefined,teacher(2))).status,404);assert.equal((await call('teacher/submissions/'+submission,'PATCH',{feedback:'x',teacherScore:100},teacher(2))).status,404);});
await test('Teacher reads report, grades it; student receives feedback',async()=>{assert.equal((await call('teacher/submissions/'+submission,'GET',undefined,teacher(1))).data.submission.report.evidence,attempt.report.evidence);assert.equal((await call('teacher/submissions/'+submission,'PATCH',{feedback:'Жақсы орындалған',teacherScore:95},teacher(1))).status,200);const r=(await call('student/submissions','GET',undefined,{Cookie:cookie})).data.submissions[0];assert.equal(r.teacherScore,95);assert.equal(r.feedback,'Жақсы орындалған');});
await test('Invalid task, forged module and grade are rejected safely',async()=>{assert.equal((await call('teacher/submissions/'+submission,'PATCH',{feedback:'x',teacherScore:101},teacher(1))).status,400);const bad=structuredClone(attempt);bad.snapshot.modules[0].id='unknown';assert.equal((await call('student/submissions','POST',{assignmentId:assignment,attempt:bad},{Cookie:cookie})).status,400);});
await test('Archived assignments reject new submissions',async()=>{await call('teacher/assignments/'+assignment,'PATCH',{active:false},teacher(1));assert.equal((await call('student/submissions','POST',{assignmentId:assignment,attempt},{Cookie:cookie})).status,404);});
await test('Password reset revokes sessions and requires new first-login password',async()=>{assert.equal((await call('teacher/students/'+user.id+'/reset-password','POST',{password:'123'},teacher(1))).status,400);await call('teacher/students/'+user.id+'/reset-password','POST',{password:'9012'},teacher(1));assert.equal((await call('student/me','GET',undefined,{Cookie:cookie})).status,401);const r=await call('student/login','POST',{username:'student-one',password:'9012'});assert.equal(r.data.student.mustChangePassword,true);cookie=r.cookie;});
await test('Deactivating account immediately revokes access',async()=>{await call('teacher/students/'+user.id+'/access','POST',{active:false},teacher(1));assert.equal((await call('student/me','GET',undefined,{Cookie:cookie})).status,401);});
await test('Expired sessions are rejected',async()=>{await call('teacher/students/'+user.id+'/access','POST',{active:true},teacher(1));const r=await call('student/login','POST',{username:'student-one',password:'9012'});sql.exec('UPDATE portal_sessions SET expires_at=1');assert.equal((await call('student/me','GET',undefined,{Cookie:r.cookie})).status,401);});
let teacherCookie;
await test('Only the verified project owner can establish a teacher login',async()=>{
 assert.equal((await call('teacher/account','POST',{username:'teacher-one',password:'4321'})).status,401);
 assert.equal((await call('teacher/account','POST',{username:'teacher-one',password:'123'},teacher(1))).status,400);
 assert.equal((await call('teacher/account','POST',{username:'student-one',password:'4321'},teacher(1))).status,409);
 const setup=await call('teacher/account','POST',{username:'teacher-one',password:'4321'},teacher(1));assert.equal(setup.status,200);assert.equal(setup.data.role,'teacher');
 assert(!JSON.stringify(setup.data).includes('4321'));
});
await test('Teacher username/password opens teacher cabinet without ChatGPT headers',async()=>{
 const r=await call('auth/login','POST',{username:'teacher-one',password:'4321'});assert.equal(r.status,200);assert.equal(r.data.role,'teacher');assert.equal(r.data.redirect,'/teacher');teacherCookie=r.cookie;
 assert(r.headers.get('set-cookie').includes('__Host-sil_teacher='));
 const students=await call('teacher/students','GET',undefined,{Cookie:teacherCookie});assert.equal(students.status,200);assert.equal(students.data.students[0].id,user.id);
 assert.equal((await call('student/me','GET',undefined,{Cookie:teacherCookie})).status,401);
});
await test('Student username/password routes to student; role parameter cannot elevate it',async()=>{
 const r=await call('auth/login','POST',{username:'student-one',password:'9012',role:'teacher'});assert.equal(r.status,200);assert.equal(r.data.role,'student');assert.equal(r.data.redirect,'/student');cookie=r.cookie;
 assert.equal((await call('teacher/students','GET',undefined,{Cookie:cookie})).status,401);
 assert.equal((await call('student/me','GET',undefined,{Cookie:cookie})).status,200);
});
await test('Student session cannot inherit teacher identity on a shared browser',async()=>{
 assert.equal((await call('teacher/students','GET',undefined,{...teacher(1),Cookie:cookie})).status,401);
 assert.equal((await call('teacher/account','POST',{username:'intruder',password:'1234'},{...teacher(1),Cookie:cookie})).status,409);
});
await test('Teacher and student logins share a unique namespace',async()=>{
 assert.equal((await call('teacher/students','POST',{username:'teacher-one',displayCode:'X',password:'1234'},teacher(1))).status,409);
 assert.equal((await call('teacher/account','POST',{username:'teacher-one',password:'1234'},teacher(2))).status,409);
});
await test('Wrong teacher password is rejected and never produces a session',async()=>{
 const r=await call('auth/login','POST',{username:'teacher-one',password:'nope'});assert.equal(r.status,401);assert.equal(r.cookie,undefined);
});
await test('Teacher session remains scoped to its original student work',async()=>{
 const list=await call('teacher/submissions','GET',undefined,{Cookie:teacherCookie});assert.equal(list.status,200);assert.equal(list.data.submissions[0].id,submission);
 assert.equal((await call('teacher/students/'+second.id+'/access','POST',{active:false},{Cookie:teacherCookie})).status,404);
});
await test('Owner password recovery preserves work and revokes old teacher sessions',async()=>{
 assert.equal((await call('teacher/account','POST',{username:'teacher-one',password:'8765'},teacher(1))).status,200);
 assert.equal((await call('teacher/students','GET',undefined,{Cookie:teacherCookie})).status,401);
 assert.equal((await call('auth/login','POST',{username:'teacher-one',password:'4321'})).status,401);
 const r=await call('auth/login','POST',{username:'teacher-one',password:'8765'});assert.equal(r.status,200);teacherCookie=r.cookie;
 assert.equal((await call('teacher/submissions','GET',undefined,{Cookie:teacherCookie})).data.submissions[0].id,submission);
});
await test('Teacher logout revokes its server session',async()=>{
 assert.equal((await call('teacher/logout','POST',{}, {Cookie:teacherCookie})).status,200);
 assert.equal((await call('teacher/me','GET',undefined,{Cookie:teacherCookie})).status,401);
});
await test('Expired teacher sessions are rejected',async()=>{
 const r=await call('auth/login','POST',{username:'teacher-one',password:'8765'});sql.exec('UPDATE portal_teacher_sessions SET expires_at=1');
 assert.equal((await call('teacher/me','GET',undefined,{Cookie:r.cookie})).status,401);
});
await test('Stale, malformed or expired student cookie does not block verified owner setup',async()=>{
 for(const value of ['invalid','a'.repeat(64)]){
  const headers={...teacher(1),Cookie:'__Host-sil_student='+value};
  const r=await call('teacher/account','GET',undefined,headers);assert.equal(r.status,200);assert(r.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await call('teacher/me','GET',undefined,headers)).status,200);
 }
 const r=await call('auth/login','POST',{username:'student-one',password:'9012'});sql.exec('UPDATE portal_sessions SET expires_at=1');
 assert.equal((await call('teacher/account','GET',undefined,{...teacher(1),Cookie:r.cookie})).status,200);
 assert.equal((await call('teacher/account','GET',undefined,{Cookie:r.cookie})).status,401);
});
await test('Active student conflict is explicit; leaving student restores owner setup without another sign-in',async()=>{
 const r=await call('auth/login','POST',{username:'student-one',password:'9012'});const headers={...teacher(1),Cookie:r.cookie};
 const blocked=await call('teacher/account','GET',undefined,headers);assert.equal(blocked.status,409);assert.equal(blocked.data.code,'student_session_active');
 assert.equal((await call('teacher/students','GET',undefined,headers)).status,401);
 assert.equal((await call('auth/leave-student','POST',{}, {...headers,Origin:'https://evil.example'})).status,403);
 const leave=await call('auth/leave-student','POST',{},headers);assert.equal(leave.status,200);assert(leave.headers.get('set-cookie').includes('Max-Age=0'));
 assert.equal((await call('student/me','GET',undefined,{Cookie:r.cookie})).status,401);
 assert.equal((await call('teacher/account','GET',undefined,headers)).status,200);
});
let flowCookie,motionAssignment;
await test('Real frontend records from all six labs in both modes submit and appear to their teacher',async()=>{
 const student=await call('teacher/students','POST',{username:'flow-student',displayCode:'FLOW',password:'1234'},teacher(3));assert.equal(student.status,201);
 const login=await call('student/login','POST',{username:'flow-student',password:'1234'});
 const changed=await call('student/password','POST',{oldPassword:'1234',newPassword:'5678'},{Cookie:login.cookie});flowCookie=changed.cookie;
 const builds={'pc-office':['mb-a','cpu-r5','cool-box','ram-8','ssd-256','psu-400'],'pc-gaming':['mb-a','cpu-r5','cool-box','ram-16','gpu-gaming','ssd-1tb','psu-550'],'pc-work':['mb-b','cpu-i7','cool-tower','ram-32','ssd-1tb','psu-550']};
 for(const mode of ['learn','exam'])for(const taskId of ['pc-office','pc-gaming','pc-work','iot-light','iot-temp','iot-motion']){
  const created=await call('teacher/assignments','POST',{taskId,mode,title:'Frontend flow',instruction:''},teacher(3));assert.equal(created.status,201);
  const app=makeApp();
  if(taskId.startsWith('pc-')){const B=app.S.PcBuilder;B.switchTask(taskId);B.switchMode(mode);for(const id of builds[taskId])B.install(id);await B.launch();}
  else{const I=app.S.IotLab;I.switchMode(mode);wire(app,taskId);I.startSimulation();I.setSimValue(taskId==='iot-light'?290:taskId==='iot-temp'?29:true);if(mode==='exam')I.finishExam();}
  const row=JSON.parse(JSON.stringify(app.S.Progress.attempts()[0]));row.report={evidence:'Құрылғының екі күйі тексерілді',fixes:'Тексерілген схема',conclusion:'Оқу нәтижесі'};
  const sent=await call('student/submissions','POST',{assignmentId:created.data.id,attempt:row},{Cookie:flowCookie});assert.equal(sent.status,201,JSON.stringify(sent.data));assert.equal(sent.data.completed,true);assert.equal(sent.data.simulatorScore,100);
  if(taskId==='iot-motion'&&mode==='exam')motionAssignment=created.data.id;
 }
 const list=(await call('teacher/submissions','GET',undefined,teacher(3))).data.submissions;assert.equal(list.length,12);assert(list.every(x=>x.completed&&x.simulatorScore===100));
});
await test('Exam with unwired GPIO is submitted as incomplete, preserving diagnostic and deduplication',async()=>{
 const app=makeApp(),I=app.S.IotLab;I.switchProject('iot-motion');I.switchMode('exam');I.addComponent('esp32');I.addComponent('pir');I.addComponent('buzzer');I.finishExam();
 const row=JSON.parse(JSON.stringify(app.S.Progress.attempts()[0]));row.report={evidence:'Қосылмаған пиндер',fixes:'GPIO таңдалмады',conclusion:'Тапсырма аяқталмаған'};assert.equal(row.snapshot.modules[0].pin,null);
 const sent=await call('student/submissions','POST',{assignmentId:motionAssignment,attempt:row},{Cookie:flowCookie});assert.equal(sent.status,201,JSON.stringify(sent.data));assert.equal(sent.data.completed,false);assert(sent.data.simulatorScore<100);
 const duplicate=await call('student/submissions','POST',{assignmentId:motionAssignment,attempt:row},{Cookie:flowCookie});assert.equal(duplicate.data.id,sent.data.id);assert.equal(duplicate.data.duplicate,true);
 const detail=(await call('teacher/submissions/'+sent.data.id,'GET',undefined,teacher(3))).data.submission;assert(detail.checkResult.issueCodes.includes('notWired'));assert.equal(detail.snapshot.modules[0].pin,null);
});
await test('Submission and conclusion automatically use the latest attempt without a chooser',async()=>{
 const app=makeApp(),I=wire(app);I.startSimulation();I.setSimValue(290);const first=app.S.Progress.attempts()[0].id;I.restartSimulation();I.setSimValue(290);const second=app.S.Progress.attempts()[1].id;
 app.S.Progress.saveReport(second,{evidence:'',fixes:'',conclusion:'Second attempt conclusion'});
 app.context.SIL_PORTAL={student:{id:'test-flow',displayCode:'FLOW'},assignment:{id:'test-assignment',taskId:'iot-light',mode:'learn',title:'Test',instruction:''}};
 let initialize,posted;const add=app.context.document.addEventListener;app.context.document.addEventListener=(event,fn)=>event==='DOMContentLoaded'?initialize=fn:add(event,fn);
 app.context.fetch=async(url,options)=>{posted=JSON.parse(options.body);return {ok:true,json:async()=>({id:'test-saved'})};};
 vm.runInContext(fs.readFileSync(new URL('../public/portal/bridge.js',import.meta.url),'utf8'),app.context);initialize();
 assert(!app.get('portal-submission').innerHTML.includes('Жіберілетін әрекет'));assert(!app.get('portal-submission').innerHTML.includes('portal-attempt'));
 app.get('portal-report').onclick();assert(app.get('report-content').innerHTML.includes('Second attempt conclusion'));
 await app.get('portal-send').onclick();assert.equal(posted.attempt.id,second);assert.notEqual(posted.attempt.id,first);
 I.restartSimulation();I.setSimValue(290);const newest=app.S.Progress.attempts().at(-1).id;app.S.Progress.saveReport(newest,{evidence:'',fixes:'',conclusion:'Newest conclusion'});
 app.get('portal-report').onclick();assert(app.get('report-content').innerHTML.includes('Newest conclusion'));await app.get('portal-send').onclick();assert.equal(posted.attempt.id,newest);
});

let timedAssignment;
const timedAttempt=id=>({...structuredClone(attempt),id});
await test('Teacher validates duration and exposes the configured time to students',async()=>{
 for(const value of [0,-1,1.5,1441,'10',true])assert.equal((await call('teacher/assignments','POST',{taskId:'iot-light',mode:'learn',title:'Bad time',timeLimitMinutes:value},teacher(3))).status,400);
 const made=await call('teacher/assignments','POST',{taskId:'iot-light',mode:'learn',title:'Timed task',timeLimitMinutes:1,latePolicy:'block'},teacher(3));assert.equal(made.status,201);timedAssignment=made.data.id;
 const item=(await call('student/assignments','GET',undefined,{Cookie:flowCookie})).data.assignments.find(x=>x.id===timedAssignment);assert.equal(item.timeLimitMinutes,1);assert.equal(item.latePolicy,'block');assert.equal(item.startedAt,null);
});
await test('Timed work requires a server start and cannot start another teacher task',async()=>{
 assert.equal((await call('student/submissions','POST',{assignmentId:timedAssignment,attempt:timedAttempt('before-start')},{Cookie:flowCookie})).data.code,'assignment_not_started');
 assert.equal((await call('student/assignments/'+timedAssignment+'/timing','GET',undefined,{Cookie:flowCookie})).data.timing,null);
 assert.equal((await call('student/assignments/'+timedAssignment+'/start','GET',undefined,{Cookie:flowCookie})).status,404);
 assert.equal((await call('student/assignments/'+timedAssignment+'/start','POST',{})).status,401);
 const foreign=(await call('teacher/assignments','POST',{taskId:'iot-light',mode:'learn',title:'Other teacher',timeLimitMinutes:1},teacher(1))).data.id;
 assert.equal((await call('student/assignments/'+foreign+'/start','POST',{}, {Cookie:flowCookie})).status,404);
});
await test('Reopening a task cannot reset its timer or extend its deadline',async()=>{
 const realNow=Date.now;let now=realNow();Date.now=()=>now;
 try{
  const first=(await call('student/assignments/'+timedAssignment+'/start','POST',{timeLimitMinutes:10000,deadlineAt:now+999999999},{Cookie:flowCookie})).data.timing;
  assert.equal(first.deadlineAt,now+60000);assert.equal(first.timeLimitMinutes,1);
  now+=10000;const second=(await call('student/assignments/'+timedAssignment+'/start','POST',{}, {Cookie:flowCookie})).data.timing;assert.equal(second.startedAt,first.startedAt);assert.equal(second.deadlineAt,first.deadlineAt);
  const read=(await call('student/assignments/'+timedAssignment+'/timing','GET',undefined,{Cookie:flowCookie})).data.timing;assert.equal(read.deadlineAt,first.deadlineAt);assert.equal(read.serverNow,now);
 }finally{Date.now=realNow;}
});
await test('Teacher can set time before start but cannot alter an already running limit',async()=>{
 const id=(await call('teacher/assignments','POST',{taskId:'iot-light',mode:'learn',title:'Edit time'},teacher(3))).data.id;
 assert.equal((await call('teacher/assignments/'+id,'PATCH',{timeLimitMinutes:5,latePolicy:'mark'},teacher(3))).status,200);
 assert.equal((await call('teacher/assignments/'+id,'PATCH',{timeLimitMinutes:10},teacher(1))).status,404);
 assert.equal((await call('teacher/assignments/'+timedAssignment,'PATCH',{timeLimitMinutes:10},teacher(3))).status,409);
});
await test('Submission at the exact deadline is accepted; later work is blocked; duplicate retry is safe',async()=>{
 const deadline=sql.prepare('SELECT deadline_at FROM portal_assignment_runs WHERE student_id=? AND assignment_id=?').get(sql.prepare("SELECT id FROM portal_students WHERE username='flow-student'").get().id,timedAssignment).deadline_at;
 const realNow=Date.now;let now=deadline;Date.now=()=>now;
 try{
  const payload={assignmentId:timedAssignment,attempt:timedAttempt('at-deadline')};const accepted=await call('student/submissions','POST',payload,{Cookie:flowCookie});assert.equal(accepted.status,201,JSON.stringify(accepted.data));assert.equal(accepted.data.isLate,false);
  now++;const repeated=await call('student/submissions','POST',payload,{Cookie:flowCookie});assert.equal(repeated.data.id,accepted.data.id);assert.equal(repeated.data.duplicate,true);
  const blocked=await call('student/submissions','POST',{assignmentId:timedAssignment,attempt:timedAttempt('after-deadline')},{Cookie:flowCookie});assert.equal(blocked.status,409);assert.equal(blocked.data.code,'deadline_passed');assert.equal(sql.prepare("SELECT count(*) AS n FROM portal_submissions WHERE attempt_id='after-deadline'").get().n,0);
 }finally{Date.now=realNow;}
});
await test('Late-accept policy records server time, marks lateness and ignores forged client deadlines',async()=>{
 const id=(await call('teacher/assignments','POST',{taskId:'iot-light',mode:'learn',title:'Accept late',timeLimitMinutes:1,latePolicy:'mark'},teacher(3))).data.id;
 const realNow=Date.now;let now=realNow();Date.now=()=>now;
 try{
  const timing=(await call('student/assignments/'+id+'/start','POST',{}, {Cookie:flowCookie})).data.timing;now=timing.deadlineAt+1000;
  const row=timedAttempt('late-marked');row.timeSec=0;const sent=await call('student/submissions','POST',{assignmentId:id,attempt:row,deadlineAt:now+9999999,latePolicy:'block'},{Cookie:flowCookie});assert.equal(sent.status,201,JSON.stringify(sent.data));assert.equal(sent.data.isLate,true);assert.equal(sent.data.lateBySec,1);assert.equal(sent.data.simulatorScore,100);
  const teacherWork=(await call('teacher/submissions/'+sent.data.id,'GET',undefined,teacher(3))).data.submission;assert.equal(teacherWork.serverDurationSec,61);assert.equal(teacherWork.deadlineAt,timing.deadlineAt);assert.equal(teacherWork.metrics.timeSec,0);assert.equal(teacherWork.isLate,true);
  const studentWork=(await call('student/submissions','GET',undefined,{Cookie:flowCookie})).data.submissions.find(x=>x.id===sent.data.id);assert.equal(studentWork.isLate,true);
 }finally{Date.now=realNow;}
});
await test('Students receive independent start times for the same assignment',async()=>{
 await call('teacher/students','POST',{username:'clock-other',displayCode:'CLOCK',password:'1234'},teacher(3));const login=await call('student/login','POST',{username:'clock-other',password:'1234'});const changed=await call('student/password','POST',{oldPassword:'1234',newPassword:'5678'},{Cookie:login.cookie});
 const own=(await call('student/assignments/'+timedAssignment+'/start','POST',{}, {Cookie:changed.cookie})).data.timing;assert.equal(own.expired,false);assert.equal(own.deadlineAt-Date.parse(own.startedAt),60000);assert(own.deadlineAt>own.serverNow);
 const flowRun=sql.prepare("SELECT r.* FROM portal_assignment_runs r JOIN portal_students s ON s.id=r.student_id WHERE s.username='flow-student' AND r.assignment_id=?").get(timedAssignment);assert.notEqual(own.startedAt,flowRun.started_at);
});
await test('Countdown uses server time and blocks only the configured late policy',async()=>{
 for(const latePolicy of ['block','mark']){
  const app=makeApp(),I=wire(app);I.startSimulation();I.setSimValue(290);
  app.context.SIL_PORTAL={student:{id:'clock',displayCode:'CLOCK'},assignment:{id:'clock-task',taskId:'iot-light',mode:'learn',title:'Clock',instruction:'',timeLimitMinutes:1,latePolicy}};
  let mono=0,tick,initialize;app.context.performance={now:()=>mono};app.context.setInterval=fn=>{tick=fn;};app.context.fetch=async()=>({ok:true,json:async()=>({timing:{startedAt:new Date(1000).toISOString(),deadlineAt:61000,serverNow:1000,timeLimitMinutes:1,latePolicy}})});
  const add=app.context.document.addEventListener;app.context.document.addEventListener=(event,fn)=>event==='DOMContentLoaded'?initialize=fn:add(event,fn);
  vm.runInContext(fs.readFileSync(new URL('../public/portal/bridge.js',import.meta.url),'utf8'),app.context);initialize();assert.equal(app.get('main').inert,true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(app.get('main').inert,false);assert(app.get('portal-timer').textContent.includes('01:00'));
  mono=59000;tick();assert(app.get('portal-timer').textContent.includes('00:01'));
  mono=60001;tick();assert(app.get('portal-timer').textContent.includes('00:00'));assert.equal(app.get('portal-send').disabled,latePolicy==='block');
 }
});
await test('Only a conclusion is required; the teacher sees it and empty text is rejected',async()=>{
 const id=(await call('teacher/assignments','POST',{taskId:'iot-light',mode:'learn',title:'Conclusion only'},teacher(3))).data.id;
 const row=timedAttempt('conclusion-only');row.report={conclusion:'Тапсырма шарттары орындалды.'};const sent=await call('student/submissions','POST',{assignmentId:id,attempt:row},{Cookie:flowCookie});assert.equal(sent.status,201,JSON.stringify(sent.data));
 const details=(await call('teacher/submissions/'+sent.data.id,'GET',undefined,teacher(3))).data.submission;assert.equal(details.report.conclusion,row.report.conclusion);assert.equal(details.report.evidence,'');assert.equal(details.report.fixes,'');
 row.id='empty-conclusion';row.report.conclusion='  ';assert.equal((await call('student/submissions','POST',{assignmentId:id,attempt:row},{Cookie:flowCookie})).status,400);
});
await test('Teacher time controls render and student Start calls the server before entering the lab',async()=>{
 const task={id:'ui-time-task',taskId:'iot-light',title:'Timed UI',instruction:'',mode:'learn',active:1,timeLimitMinutes:15,latePolicy:'block',startedAt:null,deadlineAt:null};
 const teacherApp=makeApp();teacherApp.get('[data-portal-role]').dataset.portalRole='teacher';
 teacherApp.context.fetch=async path=>({ok:true,json:async()=>path.endsWith('/me')?{teacher:{username:'teacher',configured:true}}:path.endsWith('/students')?{students:[]}:path.endsWith('/assignments')?{assignments:[task]}:{submissions:[]}});
 vm.runInContext(fs.readFileSync(new URL('../public/portal/app.js',import.meta.url),'utf8'),teacherApp.context);await new Promise(resolve=>setImmediate(resolve));
 const html=teacherApp.get('portal-content').innerHTML;assert(html.includes('name="timeLimitMinutes"'));assert(html.includes('name="latePolicy"'));assert(html.includes('15 минут'));assert(html.includes('data-time="ui-time-task"'));
 const studentApp=makeApp(),calls=[];let opened;studentApp.get('[data-portal-role]').dataset.portalRole='student';studentApp.context.location.assign=url=>{opened=url;};
 studentApp.context.fetch=async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>path.endsWith('/me')?{student:{id:'ui-student',username:'ui',displayCode:'UI',groupCode:'',mustChangePassword:false}}:path.endsWith('/assignments')?{assignments:[task]}:path.endsWith('/submissions')?{submissions:[]}:{timing:{}}};};
 vm.runInContext(fs.readFileSync(new URL('../public/portal/app.js',import.meta.url),'utf8'),studentApp.context);await new Promise(resolve=>setImmediate(resolve));assert(studentApp.get('portal-content').innerHTML.includes('data-start="ui-time-task"'));
 await studentApp.get('portal-content').onclick({target:{dataset:{start:'ui-time-task'},disabled:false}});assert.equal(opened,'/lab?assignment=ui-time-task');assert(calls.some(x=>x.path==='/api/student/assignments/ui-time-task/start'&&x.options.method==='POST'));
});
await test('Grading explains concrete GPIO, socket, DDR, cooling and power errors in Kazakh',async()=>{
 const base={motherboard:'mb-a',cpu:'cpu-r5',cooler:'cool-box',ram:'ram-16',gpu:'gpu-gaming',storage:'ssd-1tb',psu:'psu-550'};
 for(const [change,code] of [[{cpu:'cpu-i5'},'socket'],[{ram:'ram-32d5'},'ram'],[{cpu:'cpu-r7'},'cooler'],[{cpu:'cpu-r7',gpu:'gpu-power',psu:'psu-400'},'psu']]){
  const graded=gradeAttempt({...timedAttempt('diagnostic-pc'),taskId:'pc-gaming',snapshot:{type:'pc',build:{...base,...change},launched:true}});
  const issue=graded.check.issues.find(x=>x.code===code);assert(issue);assert(issue.location.length>0);assert(!issue.message.includes('{'));assert(!issue.message.startsWith('pc.'));assert(issue.nextStep.length>10);assert(graded.check.criteria.some(x=>!x.passed));
 }
 const gpio=gradeAttempt({...timedAttempt('diagnostic-gpio'),snapshot:{type:'iot',controller:'esp32',modules:[{id:'light',pin:'GPIO34'},{id:'led',pin:'GPIO35'}],values:[290,300]}});
 const issue=gpio.check.issues.find(x=>x.code==='inputOnly');assert(issue.location.includes('GPIO 35'));assert(issue.message.includes('тек кіріс'));assert(issue.nextStep.includes('GPIO'));
 const observed=gradeAttempt({...timedAttempt('one-state'),snapshot:{type:'iot',controller:'esp32',modules:[{id:'light',pin:'GPIO34'},{id:'led',pin:'GPIO2'}],values:[290]}});assert(observed.check.issues.some(x=>x.code==='notObserved_off'));
});
await test('Teacher and student both receive the saved result with exact error location and criteria',async()=>{
 const row={...timedAttempt('shared-diagnostic'),taskId:'iot-motion',mode:'exam',snapshot:{type:'iot',controller:'esp32',modules:[{id:'pir',pin:'GPIO25'},{id:'buzzer',pin:'GPIO35'}],values:[false,true]},report:{conclusion:'GPIO дұрыс таңдалмаған'}};
 const sent=await call('student/submissions','POST',{assignmentId:motionAssignment,attempt:row},{Cookie:flowCookie});assert.equal(sent.status,201);assert.equal(sent.data.completed,false);
 const teacherView=(await call('teacher/submissions/'+sent.data.id,'GET',undefined,teacher(3))).data.submission;
 const studentView=(await call('student/submissions','GET',undefined,{Cookie:flowCookie})).data.submissions.find(x=>x.id===sent.data.id);
 assert.deepEqual(studentView.checkResult,teacherView.checkResult);assert.equal(studentView.simulatorScore,teacherView.simulatorScore);assert(teacherView.checkResult.issues.some(x=>x.code==='inputOnly'&&x.location.includes('GPIO 35')));assert(teacherView.checkResult.criteria.some(x=>x.key==='wiring'&&!x.passed));
 const oldCheck=JSON.stringify({ok:false,issueCodes:['inputOnly']});sql.prepare('UPDATE portal_submissions SET check_json=? WHERE id=?').run(oldCheck,sent.data.id);
 const legacy=(await call('teacher/submissions/'+sent.data.id,'GET',undefined,teacher(3))).data.submission;assert(legacy.checkResult.issues.some(x=>x.code==='inputOnly'));assert.equal(sql.prepare('SELECT check_json FROM portal_submissions WHERE id=?').get(sent.data.id).check_json,oldCheck);
});
await test('Repeated wrong passwords are rate limited',async()=>{for(let i=0;i<10;i++)assert.equal((await call('student/login','POST',{username:'nonexistent',password:'wrong-password'})).status,401);assert.equal((await call('student/login','POST',{username:'nonexistent',password:'wrong-password'})).status,429);});
fs.writeFileSync(new URL('../docs/portal-test-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),passed,total:passed,scope:'Node Request/Response + WebCrypto + real SQLite in-memory adapter; not browser or live D1 tests; no real students.'},null,2));
console.log(`${passed}/${passed} server tests passed`);
