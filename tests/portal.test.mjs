import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { handleApi,gradeAttempt } from '../lib/portal/core.mjs';
const sql=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const DB={prepare(query){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB,AUTH_PEPPER:'test-only-pepper-abcdefghijklmnopqrstuvwxyz-123456',TEACHER_EMAILS:'teacher1@example.test,teacher2@example.test'};
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
await test('Repeated wrong passwords are rate limited',async()=>{for(let i=0;i<10;i++)assert.equal((await call('student/login','POST',{username:'nonexistent',password:'wrong-password'})).status,401);assert.equal((await call('student/login','POST',{username:'nonexistent',password:'wrong-password'})).status,429);});
fs.writeFileSync(new URL('../docs/portal-test-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),passed,total:passed,scope:'Node Request/Response + WebCrypto + real SQLite in-memory adapter; not browser or live D1 tests; no real students.'},null,2));
console.log(`${passed}/${passed} server tests passed`);
