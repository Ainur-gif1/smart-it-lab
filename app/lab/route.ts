import {env} from 'cloudflare:workers';
import {studentIdentity,finalSubmission,finalizeExpired} from '../../lib/portal/core.mjs';
import template from '../../lib/portal/lab-template.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 let student;
 try {student=await studentIdentity(request,env);}catch{return Response.redirect(new URL('/student',request.url),303);}
 const id=new URL(request.url).searchParams.get('assignment');
 const assignment=id?await env.DB!.prepare('SELECT id,title,task_id AS taskId,mode,instruction,time_limit_minutes AS timeLimitMinutes,late_policy AS latePolicy FROM portal_assignments WHERE id=? AND teacher_id=? AND active=1').bind(id,student.teacher_id).first():null;
 if(assignment){await finalizeExpired(env,{studentId:student.id,assignmentId:id});const saved=await finalSubmission(env,student.id,id);if(saved)return Response.redirect(new URL('/student#submission-'+saved.id,request.url),303);}
 if(!assignment)return new Response('Белсенді тапсырма табылмады. Студент кабинетіне оралыңыз.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
 const boot=JSON.stringify({student:{id:student.id,displayCode:student.display_code},assignment}).replace(/</g,'\\u003c');
 return new Response(template.replace('__PORTAL_BOOT__',()=>boot),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
}
