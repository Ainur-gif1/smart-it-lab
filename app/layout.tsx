import type { Metadata } from 'next';
export const metadata: Metadata = {title:'SMART IT LAB — Жеке кабинет',description:'Студент тапсырмалары және оқытушы кабинеті',icons:{icon:'/lab-assets/assets/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="kk"><body style={{margin:0}}>{children}</body></html>; }
