import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppError } from '@cluster/contracts';
import { profile } from '../../src/server/foundation-api';
import { SecuritySettings } from './security-settings';

export default async function Account() {
  let data: Awaited<ReturnType<typeof profile>>;
  try { data = await profile(await headers()); }
  catch (error) {
    if (error instanceof AppError && error.code === 'UNAUTHENTICATED') redirect('/login');
    if (error instanceof AppError && error.code === 'RATE_LIMITED') return <main className="identity-page"><h1>Demasiadas solicitudes</h1><p>Espera un minuto y vuelve a intentarlo.</p></main>;
    return <main className="identity-page"><h1>Acceso no disponible</h1><p>La sesión o la configuración de tu organización requiere revisión.</p><Link href="/login">Volver al acceso</Link></main>;
  }
  return <main className="identity-page"><Link href="/panel">← Panel interno</Link><p className="tag">CUENTA Y SEGURIDAD</p>
    <h1>Tu acceso</h1><p className="lead">Tus permisos se comprueban en el servidor para cada organización.</p>
    <ul className="membership-list">{data.memberships.map(m => <li key={m.organization_id}><strong>{m.role}</strong><span>{m.organization_id}</span></li>)}</ul>
    <SecuritySettings enabled={data.two_factor_enabled} />
    <p className="identity-note">Fase 01 en preparación. La producción y publicación de vídeos continúan bloqueadas.</p></main>;
}
