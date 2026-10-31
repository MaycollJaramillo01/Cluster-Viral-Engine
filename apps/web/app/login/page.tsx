import Link from 'next/link';
import { LoginForm } from './login-form';

export default function Login() {
  return <main className="identity-page"><Link href="/">← Cluster Viral Engine</Link>
    <p className="tag">ACCESO EDITORIAL</p><h1>Iniciar sesión</h1>
    <p className="lead">Usa tu cuenta asignada. El registro público está cerrado.</p><LoginForm />
    <p className="identity-note">El acceso no autoriza publicar. Cada vídeo requiere revisión humana.</p></main>;
}
