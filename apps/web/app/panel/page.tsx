'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loading, useApi, type Data } from './ui';

export default function Organizations() {
  const router = useRouter(), { data, error } = useApi('/api/me');
  const memberships: Data[] = data?.memberships ?? [];
  useEffect(() => { if (data?.memberships?.length === 1) router.replace(`/panel/${data.memberships[0].organization_id}`); }, [data, router]);
  if (!data) return <main><Loading error={error} /></main>;
  return <main><p className="tag">ORGANIZACIONES</p><h1>Elige una organización</h1>
    {memberships.length ? <ul className="rows">{memberships.map(m => <li key={m.organization_id}><Link href={`/panel/${m.organization_id}`}>{m.organization_id}</Link><span>{m.role}</span></li>)}</ul>
      : <p className="muted">Tu cuenta no pertenece a ninguna organización.</p>}
  </main>;
}
