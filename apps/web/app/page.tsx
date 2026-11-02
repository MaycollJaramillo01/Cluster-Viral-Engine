import Link from 'next/link';

const modules=[
  ['Radar editorial','Historias candidatas y su riesgo','En el panel · propuestas con IA sin clave'],
  ['Investigación','Fuentes, afirmaciones y verificación humana','En el panel · extracción con IA sin clave'],
  ['Guiones','Versiones, ganchos y escenas','En el panel · generación con IA sin clave'],
  ['Media y voz','Licencias, aprobación y voz por escena','En el panel · ElevenLabs y Blob sin configurar'],
  ['Render','Video vertical con FFmpeg','Worker local · sin desplegar'],
  ['Revisión','Aprobación de la versión exacta','En el panel'],
  ['Publicación','Meta oficial','Bloqueada: falta acceso a Meta']
];
export default function Page(){return <main><p className="tag">CLUSTER MEDIA</p><h1>Cluster Viral Engine</h1><p className="lead">Producción editorial de documentales verticales con fuentes verificadas. El panel interno funciona con base de datos local; <strong>la publicación está deshabilitada</strong> y la IA, la voz y el almacenamiento necesitan credenciales.</p><p><Link href="/panel">Abrir el panel interno →</Link></p><div className="grid">{modules.map(([name,description,status],i)=><article key={name}><div className="num">0{i+1}</div><h2>{name}</h2><p>{description}</p><span>{status}</span></article>)}</div><div className="notice"><strong>Gate de publicación:</strong> Ningún video se publica sin revisión humana, verificaciones de fuentes/licencias y aprobación ligada al hash del render.</div><footer>Documentación: README.md · ROADMAP.md · phases/ · db/ · api/</footer></main>}
