'use client';
import {useEffect} from 'react';
// Load after hydration, in dependency order, without replacing the live forms.
export function PortalClient(){
 useEffect(()=>{
  let cancelled=false;const scripts:HTMLScriptElement[]=[];
  function load(src:string){return new Promise<void>((resolve,reject)=>{if(cancelled){resolve();return;}const script=document.createElement('script');script.src=src;script.onload=()=>resolve();script.onerror=()=>reject(new Error('Script unavailable'));scripts.push(script);document.body.appendChild(script);});}
  load('/portal/locale-data.js').then(()=>load('/portal/i18n.js')).then(()=>load('/portal/app.js')).catch(()=>{const notice=document.getElementById('notice');if(notice)notice.textContent='Бетті жаңартыңыз / Обновите страницу';});
  return ()=>{cancelled=true;scripts.forEach(script=>script.remove());};
 },[]);
 return null;
}
