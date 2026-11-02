import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = { title: 'Panel interno · Cluster Viral Engine' };
// Sin datos aquí: cada página pide lo suyo a la API, que exige sesión y rol, y sin sesión el cliente vuelve a /login.
export default function PanelLayout({ children }: { children: ReactNode }) {
  return <div className="panel">
    <header className="panel-bar"><Link href="/panel" className="panel-brand">Cluster Viral Engine · Panel interno</Link>
      <span className="badge">Publicación deshabilitada</span><Link href="/account">Cuenta</Link></header>
    {children}
  </div>;
}
