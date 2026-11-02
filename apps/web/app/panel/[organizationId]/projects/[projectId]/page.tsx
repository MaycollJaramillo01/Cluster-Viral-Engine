'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { can } from '@cluster/contracts';
import { Loading, projectSteps, useApi } from '../../../ui';
import { Research } from './research';
import { Script } from './script';
import { Media } from './media';
import { Renders } from './renders';

const tabs = [['research', 'Investigación'], ['script', 'Guion'], ['media', 'Material y voz'], ['render', 'Render y revisión']] as const;
const tabFor = (status: string) => status.startsWith('RESEARCH') ? 'research' : status.startsWith('SCRIPT') ? 'script' : ['ASSETING', 'VOICING'].includes(status) ? 'media' : 'render';

export default function Project({ params }: { params: Promise<{ organizationId: string; projectId: string }> }) {
  const { organizationId, projectId } = use(params), org = `/api/organizations/${organizationId}`, base = `${org}/projects/${projectId}`;
  const context = useApi(`${org}/context`), project = useApi(base), [tab, setTab] = useState<string | null>(null);
  if (!project.data || !context.data) return <main><Loading error={project.error ?? context.error} /></main>;
  const current = tab ?? tabFor(project.data.status), step = projectSteps.findIndex(([status]) => status === project.data.status);
  const props = { base, project: project.data, reload: project.reload, write: can(context.data.role, 'project:write'), review: can(context.data.role, 'editorial:review') };
  return <main>
    <Link href={`/panel/${organizationId}`}>← Radar</Link>
    <p className="tag">PROYECTO · ROL {context.data.role.toUpperCase()}{props.review ? ' · PUEDES APROBAR' : ' · NO PUEDES APROBAR'}</p>
    <h1 className="project-title">{project.data.title}</h1>
    <ol className="steps">{projectSteps.map(([status, name], i) => <li key={status} className={i < step ? 'done' : i === step ? 'current' : undefined}>{name}</li>)}</ol>
    <nav className="tabs" role="tablist">{tabs.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={current === id} className={current === id ? 'active' : undefined} onClick={() => setTab(id)}>{name}</button>)}</nav>
    {current === 'research' && <Research {...props} />}
    {current === 'script' && <Script {...props} />}
    {current === 'media' && <Media {...props} />}
    {current === 'render' && <Renders {...props} />}
  </main>;
}
