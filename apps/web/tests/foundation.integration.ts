import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { AppError, type VerifiedIdentity } from '@cluster/contracts';
import { migrate } from '../src/server/migrations';
import { provisionRoles, seedDevelopmentIdentity } from '../src/server/development';
import { TenantDatabase } from '../src/server/database';
import { createIdentityService } from '../src/server/auth';
import { parseConfig } from '../src/server/config';
import { getMigrations } from 'better-auth/db/migration';
import { requestHandler } from '../src/server/observability';
import { inspectDatabase, inspectMigrations, migrationChecksums } from '../../../scripts/lib/environment-readiness.mjs';

const serverUrl = process.env.PHASE01_TEST_ADMIN_URL;
test('foundation: real PostgreSQL, migrations, authentication, MFA and tenant isolation', { skip: !serverUrl }, async t => {
  const tag = `${process.pid}_${randomBytes(3).toString('hex')}`, database = `cve_test_${tag}`;
  const runtimeRole = `cve_runtime_${tag}`, authRole = `cve_auth_${tag}`;
  const server = new Pool({ connectionString: serverUrl, max: 1 });
  let admin: Pool | undefined, runtime: Pool | undefined, authPool: Pool | undefined;
  const migrationDir = path.resolve('../../db/migrations');
  try {
    await server.query(`CREATE DATABASE "${database}"`);
    const url = new URL(serverUrl!); url.pathname = `/${database}`;
    admin = new Pool({ connectionString: url.toString(), max: 4 });
    await t.test('parallel migration runners serialize, rerun is no-op and six migrations are recorded', async () => {
      const runs = await Promise.all([migrate(admin!, migrationDir), migrate(admin!, migrationDir)]);
      assert.equal(runs.reduce((n,r) => n+r.applied.length,0),6);
      assert.equal((await migrate(admin!, migrationDir)).skipped.length,6);
      assert.equal((await admin!.query('SELECT count(*)::int AS n FROM schema_migrations WHERE checksum_sha256 IS NOT NULL')).rows[0].n,6);
    });
    await t.test('checksum drift is rejected; a broken migration rolls back its DDL and version', async () => {
      const temp = await mkdtemp(path.join(os.tmpdir(),'cve-migrations-'));
      try {
        await cp(migrationDir,temp,{recursive:true});
        await writeFile(path.join(temp,'007_bad.sql'),'CREATE TABLE should_not_survive(id int); SELECT no_such_function();');
        await assert.rejects(migrate(admin!,temp));
        assert.equal((await admin!.query("SELECT to_regclass('should_not_survive') AS name")).rows[0].name,null);
        const first = path.join(temp,'001_init.sql'); await writeFile(first,(await readFile(first,'utf8'))+'\n-- drift\n');
        await assert.rejects(migrate(admin!,temp),/MIGRATION_CHECKSUM_MISMATCH/);
      } finally { await rm(temp,{recursive:true,force:true}); }
    });
    const password = randomBytes(18).toString('base64url'), rolePassword = randomBytes(24).toString('hex');
    await provisionRoles(admin,runtimeRole,authRole,rolePassword,rolePassword);
    const runtimeUrl = new URL(url), identityUrl = new URL(url);
    runtimeUrl.username=runtimeRole; runtimeUrl.password=rolePassword;
    identityUrl.username=authRole; identityUrl.password=rolePassword;
    runtime=new Pool({connectionString:runtimeUrl.toString(),max:4,options:'-c statement_timeout=1000'});
    authPool=new Pool({connectionString:identityUrl.toString(),max:4});
    await t.test('environment preflight checks real roles, migration checksums and missing grants without writes', async () => {
      const expected = await migrationChecksums(migrationDir);
      assert.equal((await inspectDatabase(runtime!, 'runtime')).status, 'READY');
      assert.equal((await inspectDatabase(authPool!, 'identity')).status, 'READY');
      assert.equal((await inspectDatabase(admin!, 'runtime')).status, 'BLOCKED');
      assert.equal((await inspectMigrations(admin!, expected)).status, 'READY');
      await admin!.query(`REVOKE SELECT ON auth_users FROM "${authRole}"`);
      try { assert.equal((await inspectDatabase(authPool!, 'identity')).status, 'BLOCKED'); }
      finally { await admin!.query(`GRANT SELECT ON auth_users TO "${authRole}"`); }
      assert.equal((await runtime!.query('SELECT * FROM app_users')).rowCount, 0);
    });
    const orgA=randomUUID(), orgB=randomUUID();
    await admin.query("INSERT INTO organizations(id,slug,name) VALUES($1,'org-alpha','A'),($2,'org-beta','B')",[orgA,orgB]);
    const a=await seedDevelopmentIdentity(admin,{email:'a@example.test',password,organizationId:orgA,role:'editor'});
    const b=await seedDevelopmentIdentity(admin,{email:'b@example.test',password,organizationId:orgB,role:'owner'});
    const identity:VerifiedIdentity={subject:a.subject,expiresAt:new Date(Date.now()+60000),twoFactorEnabled:false};
    const db = new TenantDatabase(runtime);
    await t.test('membership derives from verified subject; cross-org, forged subject, owner without MFA and DB owner denied',async()=>{
      assert.equal(await db.organizationTransaction(identity,orgA,'organization:read',async(_,c)=>c.actorId),a.actorId);
      await assert.rejects(db.organizationTransaction(identity,orgB,'organization:read',async()=>true),AppError);
      await assert.rejects(db.organizationTransaction({...identity,subject:randomUUID()},orgA,'organization:read',async()=>true),AppError);
      await assert.rejects(db.organizationTransaction(identity,orgA,'organization:manage',async()=>true),AppError);
      await assert.rejects(db.organizationTransaction({...identity,subject:b.subject},orgB,'organization:read',async()=>true),e=>e instanceof AppError && e.code==='MFA_REQUIRED');
      await assert.rejects(new TenantDatabase(admin!).identityTransaction(identity,async()=>true),AppError);
    });
    await t.test('RLS protects users and projects, contexts do not leak after commit/rollback; auth and app roles separate',async()=>{
      await admin!.query('INSERT INTO projects(organization_id,title) VALUES($1,$2),($3,$4)',[orgA,'A',orgB,'B']);
      await db.organizationTransaction(identity,orgA,'organization:read',async(client)=>{
        assert.equal((await client.query('SELECT * FROM app_users')).rowCount,1);
        const rows=await client.query('SELECT organization_id FROM projects');
        assert.equal(rows.rowCount,1); assert.equal(rows.rows[0].organization_id,orgA);
        const me=await client.query('SELECT auth_subject FROM app_users'); assert.equal(me.rows[0].auth_subject,a.subject);
      });
      const c=await runtime!.connect();
      try { assert.equal((await c.query('SELECT * FROM app_users')).rowCount,0); assert.equal((await c.query('SELECT * FROM projects')).rowCount,0); }
      finally { c.release(); }
      await assert.rejects(runtime!.query('SELECT * FROM auth_users'),/permission denied/);
      await assert.rejects(authPool!.query('SELECT * FROM projects'),/permission denied/);
    });
    await t.test('expired identity and statement timeout roll back without releasing data or dirty pooled state',async()=>{
      await assert.rejects(db.identityTransaction({...identity,expiresAt:new Date(0)},async()=>true),AppError);
      await assert.rejects(db.organizationTransaction(identity,orgA,'organization:read',async c=>{await c.query('SELECT pg_sleep(2)');}),/statement timeout/);
      assert.equal(await db.organizationTransaction(identity,orgA,'organization:read',async c=>(await c.query('SELECT 1 AS n')).rows[0].n),1);
    });
    await t.test('cross-organization writes fail and a swallowed SQL error cannot masquerade as a successful commit',async()=>{
      const projectB=(await admin!.query('SELECT id FROM projects WHERE organization_id=$1 LIMIT 1',[orgB])).rows[0].id;
      await assert.rejects(db.organizationTransaction(identity,orgA,'organization:read',async c=>{
        await c.query(`INSERT INTO phase00_runs(organization_id,project_id,actor_id,ticket,operation,idempotency_key,input_sha256)
          VALUES($1,$2,$3,'F00-04','RENDER','cross-org-write',$4)`,[orgB,projectB,b.actorId,'a'.repeat(64)]);
      }),/row-level security/);
      await assert.rejects(db.identityTransaction(identity,async c=>{
        try {await c.query('SELECT function_that_does_not_exist()');} catch { /* Caller incorrectly swallows SQL failure. */ }
        return 'must not commit';
      }),e=>e instanceof AppError&&e.code==='INTERNAL_ERROR');
    });
    const config=parseConfig({APP_ENV:'local',DATABASE_URL:runtimeUrl.toString(),AUTH_DATABASE_URL:identityUrl.toString(),
      BETTER_AUTH_URL:'http://127.0.0.1:3000',BETTER_AUTH_SECRET:randomBytes(48).toString('hex')});
    const service=createIdentityService(authPool,config);
    await t.test('versioned identity DDL matches installed library including MFA/rate limiting',async()=>{
      const check=await getMigrations(service.options);
      assert.equal(check.toBeCreated.length,0); assert.equal(check.toBeAdded.length,0); assert.equal(check.toBeAddedIndexes.length,0);
    });
    let cookie='';
    const request=async(endpoint:string,body?:unknown,extra:Record<string,string>={})=>{
      const headers=new Headers({'origin':config.BETTER_AUTH_URL,'x-cve-client-ip':'127.0.0.1',...extra});
      if(cookie)headers.set('cookie',cookie);
      if(body!==undefined)headers.set('content-type','application/json');
      const response=await service.handler(new Request(`${config.BETTER_AUTH_URL}/api/auth/${endpoint}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}));
      const entries=new Map(cookie.split('; ').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
      for(const set of response.headers.getSetCookie()){const part=set.split(';')[0],i=part.indexOf('=');if(part.slice(i+1))entries.set(part.slice(0,i),part.slice(i+1));else entries.delete(part.slice(0,i));}
      cookie=[...entries].map(([k,v])=>`${k}=${v}`).join('; ');
      return response;
    };
    await t.test('wrong password, public signup and cross-origin sign-in rejected; HttpOnly session works',async()=>{
      assert.equal((await request('sign-in/email',{email:'a@example.test',password:'wrong-password-123'})).status,401);
      assert((await request('sign-up/email',{name:'No',email:'no@example.test',password})).status>=400);
      assert.equal((await request('sign-in/email',{email:'a@example.test',password},{origin:'https://evil.example'})).status,403);
      const response=await request('sign-in/email',{email:'a@example.test',password,rememberMe:false});
      assert.equal(response.status,200,await response.clone().text());
      assert(response.headers.getSetCookie().some(s=>/HttpOnly/i.test(s)&&/SameSite=Lax/i.test(s)));
      const session=await request('get-session'); assert.equal((await session.json()).user.id,a.subject);
      assert((await admin!.query("SELECT 1 FROM auth_events WHERE user_id=$1 AND action='SESSION_CREATED'",[a.subject])).rowCount);
    });
    await t.test('MFA enrollment confirms TOTP, encrypts secret, then requires challenge on next login',async()=>{
      const otherBrowser = cookie;
      assert.equal((await request('sign-in/email',{email:'a@example.test',password})).status,200);
      const enabled=await request('two-factor/enable',{password}); assert.equal(enabled.status,200,await enabled.clone().text());
      const data=await enabled.json(); const secret=new URL(data.totpURI).searchParams.get('secret')!;
      const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits='';
      for(const char of secret.toUpperCase())bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
      const bytes=Buffer.from(bits.match(/.{8}/g)!.map(part=>parseInt(part,2)));
      const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
      const hash=createHmac('sha1',bytes).update(counter).digest(),offset=hash[19]&15;
      const code=String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
      const verified=await request('two-factor/verify-totp',{code}); assert.equal(verified.status,200,await verified.clone().text());
      const challenged = cookie;
      cookie = otherBrowser;
      assert.equal(await (await request('get-session')).json(),null,'pre-MFA session in another browser must be revoked');
      cookie = challenged;
      const stored=await admin!.query('SELECT secret FROM auth_two_factors WHERE "userId"=$1',[a.subject]);
      assert.notEqual(stored.rows[0].secret,secret);
      assert.equal((await admin!.query('SELECT "twoFactorEnabled" FROM auth_users WHERE id=$1',[a.subject])).rows[0].twoFactorEnabled,true);
      await request('sign-out',{});cookie='';
      const signIn=await request('sign-in/email',{email:'a@example.test',password}); assert.equal(signIn.status,200);
      assert.equal((await signIn.json()).twoFactorRedirect,true);
      const pending=await request('get-session');assert.equal(await pending.json(),null);
      const complete=await request('two-factor/verify-totp',{code});assert.equal(complete.status,200,await complete.clone().text());
      assert.equal((await (await request('get-session')).json()).user.id,a.subject);
    });
    await t.test('logout revokes access; expired server-side session is rejected even with an old cookie',async()=>{
      const old=cookie;assert.equal((await request('sign-out',{})).status,200);
      cookie=old;assert.equal(await(await request('get-session')).json(),null);
      cookie='';await request('sign-in/email',{email:'b@example.test',password});
      await admin!.query('UPDATE auth_sessions SET "expiresAt"=$1 WHERE "userId"=$2',[new Date(0),b.subject]);
      assert.equal(await(await request('get-session')).json(),null);
    });
    await t.test('auth session/audit atomicity and append-only history enforced by PostgreSQL',async()=>{
      const before=(await admin!.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n;
      await admin!.query(`REVOKE INSERT ON auth_events FROM "${authRole}"`);
      cookie='';
      const logged: unknown[][] = [], originalError = console.error;
      console.error = (...args: unknown[]) => { logged.push(args); };
      try {
        const response = await requestHandler(new Request(config.BETTER_AUTH_URL), 'identity.failure-test', () => request('sign-in/email',{email:'b@example.test',password}));
        assert.equal(response.status,503);
        assert(!(await response.text()).includes(password));
        assert.equal(logged.length,0,'SDK must not emit raw driver errors');
      }
      finally { console.error = originalError; await admin!.query(`GRANT INSERT ON auth_events TO "${authRole}"`); }
      assert.equal((await admin!.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,before);
      await assert.rejects(admin!.query("UPDATE auth_events SET action='SESSION_REVOKED'"),/append-only/);
    });
    await t.test('rollback of 006/005/004 retains identity audit; transaction rollback restores complete schema',async()=>{
      const c=await admin!.connect();
      try {
        const before=(await c.query('SELECT count(*)::int AS n FROM auth_events')).rows[0].n;
        await c.query('BEGIN');
        for(const name of ['006_mfa_session_revocation','005_identity_rls','004_identity'])await c.query(await readFile(`../../db/rollback/${name}.sql`,'utf8'));
        assert.equal((await c.query("SELECT to_regclass('auth_users') AS name")).rows[0].name,null);
        assert.equal((await c.query('SELECT count(*)::int AS n FROM auth_events')).rows[0].n,before);
        await c.query('ROLLBACK');
        assert.equal((await c.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,6);
      } finally {await c.query('ROLLBACK');c.release();}
    });
  } finally {
    await authPool?.end();await runtime?.end();await admin?.end();
    // Only the uniquely named database created by this test is dropped; never a supplied DB.
    if(/^cve_test_[0-9]+_[a-f0-9]+$/.test(database))await server.query(`DROP DATABASE IF EXISTS "${database}"`);
    for(const name of [runtimeRole,authRole])if(/^cve_(runtime|auth)_[0-9]+_[a-f0-9]+$/.test(name))await server.query(`DROP ROLE IF EXISTS "${name}"`);
    await server.end();
  }
});
