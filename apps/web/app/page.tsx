import Link from 'next/link';

const modules=[
  ['Radar editorial','Descubrimiento e índice experimental'],
  ['Investigación','Sources, claims y verificación humana'],
  ['Guiones','Versiones, ganchos y escenas'],
  ['Media y voz','Licencias, ElevenLabs, caché'],
  ['Render','FFmpeg worker asíncrono'],
  ['Revisión','Aprobación de versión exacta'],
  ['Publicación','Meta oficial y snapshots disponibles']
];
export default function Page(){return <main><p className="tag">CLUSTER MEDIA / BUILD BLUEPRINT</p><h1>Cluster Viral Engine</h1><p className="lead">Esqueleto de referencia para Next.js en Vercel + Neon. <strong>No es el panel funcional todavía.</strong> Las integraciones críticas requieren credenciales, permisos y pruebas.</p><p><Link href="/login">Acceder a tu cuenta →</Link></p><div className="grid">{modules.map(([name,description],i)=><article key={name}><div className="num">0{i+1}</div><h2>{name}</h2><p>{description}</p><span>Por implementar</span></article>)}</div><div className="notice"><strong>Gate de publicación:</strong> Ningún video se publica sin revisión humana, verificaciones de fuentes/licencias y aprobación ligada al hash del render.</div><footer>Documentación: README.md · ROADMAP.md · phases/ · db/ · api/</footer></main>}
