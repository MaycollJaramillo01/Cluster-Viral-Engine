'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../src/auth-client';

export function SecuritySettings({ enabled }: { enabled: boolean }) {
  const router = useRouter(), [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setPasswordMessage('');
    const form = event.currentTarget, values = new FormData(form);
    const newPassword = String(values.get('newPassword'));
    if (newPassword !== String(values.get('confirmPassword'))) {
      setPasswordMessage('Las contraseñas nuevas no coinciden.'); setBusy(false); return;
    }
    try {
      const result = await authClient.changePassword({ currentPassword: String(values.get('currentPassword')), newPassword, revokeOtherSessions: true });
      if (result.error) { setPasswordMessage('No se pudo cambiar la contraseña. Comprueba tu contraseña actual.'); return; }
      form.reset(); setPasswordMessage('Contraseña actualizada. Se cerraron las demás sesiones.');
    } catch { setPasswordMessage('El servicio no está disponible.'); }
    finally { setBusy(false); }
  }
  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const password = String(new FormData(event.currentTarget).get('password'));
    try {
      const result = await authClient.twoFactor.enable({ password });
      if (result.error || !result.data || !('totpURI' in result.data)) { setMessage('No se pudo preparar el segundo factor.'); return; }
      setSetup({ totpURI: result.data.totpURI, backupCodes: result.data.backupCodes });
    } catch { setMessage('El servicio no está disponible.'); } finally { setBusy(false); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: String(new FormData(event.currentTarget).get('code')), trustDevice: false });
      if (result.error) { setMessage('Código inválido o vencido.'); return; }
      setSetup(null); router.refresh();
    } catch { setMessage('El servicio no está disponible.'); } finally { setBusy(false); }
  }
  return <section className="security-settings"><h2>Verificación en dos pasos</h2>
    <p>{enabled ? 'Segundo factor activo.' : 'Protege tu cuenta con una app de autenticación. Es obligatorio para owner y admin.'}</p>
    {!enabled && !setup && <form className="identity-form" onSubmit={enable}><label>Confirma tu contraseña<input name="password" type="password" autoComplete="current-password" required /></label><button disabled={busy}>Preparar autenticador</button></form>}
    {setup && <><p>Añade esta clave a tu autenticador. Guarda los códigos de respaldo en un lugar privado.</p>
      <code className="private-code">{new URL(setup.totpURI).searchParams.get('secret')}</code>
      <details><summary>Códigos de respaldo</summary><pre className="private-code">{setup.backupCodes.join('\n')}</pre></details>
      <form className="identity-form" onSubmit={verify}><label>Código del autenticador<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required /></label><button disabled={busy}>Confirmar segundo factor</button></form></>}
    {message && <p role="alert">{message}</p>}
    <h2>Cambiar contraseña</h2>
    <form className="identity-form" onSubmit={changePassword}>
      <label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></label>
      <label>Nueva contraseña<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
      <label>Repite la nueva contraseña<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
      <button type="submit" disabled={busy}>{busy ? 'Comprobando…' : 'Cambiar contraseña'}</button>
    </form>
    {passwordMessage && <p role="status">{passwordMessage}</p>}
    <button type="button" className="secondary-button" onClick={async () => { await authClient.signOut(); router.replace('/login'); router.refresh(); }}>Cerrar sesión</button>
  </section>;
}
