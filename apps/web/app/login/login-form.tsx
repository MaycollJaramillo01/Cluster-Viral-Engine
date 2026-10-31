'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../src/auth-client';

export function LoginForm() {
  const router = useRouter(), [secondFactor, setSecondFactor] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const values = new FormData(event.currentTarget);
    try {
      if (secondFactor) {
        const result = await authClient.twoFactor.verifyTotp({ code: String(values.get('code')), trustDevice: false });
        if (result.error) { setMessage('Código inválido o vencido.'); return; }
      } else {
        const result = await authClient.signIn.email({ email: String(values.get('email')), password: String(values.get('password')), rememberMe: false });
        if (result.error) { setMessage('No se pudo iniciar sesión. Comprueba tus datos o la disponibilidad del servicio.'); return; }
        if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect) { setSecondFactor(true); return; }
      }
      router.replace('/account'); router.refresh();
    } catch { setMessage('El servicio de acceso no está disponible.'); }
    finally { setBusy(false); }
  }
  return <form className="identity-form" onSubmit={submit}>
    {secondFactor ? <label>Código del autenticador<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required autoFocus /></label> : <>
      <label>Correo<input type="email" name="email" autoComplete="username" required /></label>
      <label>Contraseña<input type="password" name="password" autoComplete="current-password" required maxLength={128} /></label></>}
    {message && <p role="alert">{message}</p>}<button type="submit" disabled={busy}>{busy ? 'Comprobando…' : secondFactor ? 'Verificar código' : 'Entrar'}</button>
  </form>;
}
