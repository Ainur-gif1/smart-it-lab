'use client';
import {useEffect} from 'react';
// The legacy portal renders inside an empty island only after React hydration.
export function PortalClient(){
 useEffect(()=>{
  const script=document.createElement('script');script.src='/portal/app.js';script.async=true;
  document.body.appendChild(script);
  return ()=>{script.remove();};
 },[]);
 return null;
}
