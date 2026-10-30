import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Pool } from 'pg';
import { Phase00Store } from '../src/phase00/store';

const adminUrl = process.env.PHASE00_TEST_ADMIN_URL;
const orgA='11111111-1111-4111-8111-111111111111', orgB='33333333-3333-4333-8333-333333333333';
const actorA='44444444-4444-4444-8444-444444444444', actorB='55555555-5555-4555-8555-555555555555', analyst='66666666-6666-4666-8666-666666666666';
const projectA='22222222-2222-4222-8222-222222222222', projectB='77777777-7777-4777-8777-777777777777';

test('PostgreSQL real aislado: migraciones, tenant/RBAC, idempotencia, auditoría y rollback', { skip: !adminUrl }, async t => {
  const admin = new Pool({ connectionString: adminUrl });
  let runtime: Pool | undefined;
  const role = `phase00_runtime_${process.pid}`;
  try {
    const exists = await admin.query("SELECT to_regclass('public.organizations') AS name");
    assert.equal(exists.rows[0].name,null,'Use a fresh DISPOSABLE database; test refuses existing schemas');
    for (const migration of ['001_init','002_rls','003_phase00']) {
      await admin.query('BEGIN');
      await admin.query(await readFile(`../../db/migrations/${migration}.sql`,'utf8'));
      await admin.query('COMMIT');
    }
    // role name contains process.pid only, not external input. Credential is disposable test-only.
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD 'phase00-test-only' NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT ON memberships,projects,phase00_runs,audit_events,outbox_events TO ${role}`);
    await admin.query(`GRANT INSERT,UPDATE ON phase00_runs TO ${role}`);
    await admin.query(`GRANT INSERT ON audit_events,outbox_events TO ${role}`);
    await admin.query(`INSERT INTO organizations(id,slug,name) VALUES($1,'tenant-a','A'),($2,'tenant-b','B')`,[orgA,orgB]);
    for (const [id,name] of [[actorA,'editor-a'],[actorB,'editor-b'],[analyst,'analyst-a']]) {
      await admin.query('INSERT INTO app_users(id,auth_subject,email) VALUES($1,$2,$3)',[id,name,`${name}@example.invalid`]);
    }
    await admin.query(`INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'editor'),($3,$4,'editor'),($1,$5,'analyst')`,[orgA,actorA,orgB,actorB,analyst]);
    await admin.query(`INSERT INTO projects(id,organization_id,title) VALUES($1,$2,'POC A'),($3,$4,'POC B')`,[projectA,orgA,projectB,orgB]);
    const runtimeUrl=new URL(adminUrl!); runtimeUrl.username=role; runtimeUrl.password='phase00-test-only';
    runtime=new Pool({connectionString:runtimeUrl.toString(),max:12});
    const store=new Phase00Store(runtime), p={organizationId:orgA,actorId:actorA};
    const request={projectId:projectA,ticket:'F00-04',operation:'RENDER' as const,key:'same-render',input:{manifest:'version-1'}};
    let id='';
    await t.test('10 solicitudes concurrentes producen una reserva, una auditoría y un outbox',async()=>{
      const results=await Promise.all(Array.from({length:10},()=>store.reserve(p,request)));
      assert.equal(results.filter(r=>r.claimed).length,1); assert.equal(new Set(results.map(r=>r.id)).size,1); id=results[0].id;
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n,1);
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n,1);
    });
    await t.test('RBAC, organización, proyecto y clave reutilizada con otro input son rechazados',async()=>{
      await assert.rejects(store.reserve({organizationId:orgB,actorId:actorA},request),/FORBIDDEN_MEMBERSHIP/);
      await assert.rejects(store.reserve({organizationId:orgA,actorId:analyst},request),/FORBIDDEN_MEMBERSHIP/);
      await assert.rejects(store.reserve(p,{...request,projectId:projectB}),/FORBIDDEN_PROJECT/);
      await assert.rejects(store.reserve(p,{...request,input:{manifest:'version-2'}}),/IDEMPOTENCY_CONFLICT/);
      await assert.rejects(new Phase00Store(admin).reserve(p,request),/UNSAFE_DATABASE_ROLE/);
    });
    await t.test('RLS niega lectura/escritura cruzada y FK compuesta niega proyecto externo',async()=>{
      const c=await runtime!.connect();
      try {
        await c.query('BEGIN'); await c.query("SELECT set_config('app.organization_id',$1,true)",[orgB]);
        assert.equal((await c.query('SELECT * FROM phase00_runs')).rowCount,0);
        assert.equal((await c.query('UPDATE phase00_runs SET status=$1 WHERE id=$2',['FAILED',id])).rowCount,0);
        await assert.rejects(c.query(`INSERT INTO phase00_runs(organization_id,project_id,actor_id,ticket,operation,idempotency_key,input_sha256)
          VALUES($1,$2,$3,'F00-04','RENDER','attack',$4)`,[orgA,projectA,actorA,'a'.repeat(64)]),/row-level security/);
        await c.query('ROLLBACK');
        await c.query('BEGIN'); await c.query("SELECT set_config('app.organization_id',$1,true)",[orgA]);
        await assert.rejects(c.query(`INSERT INTO phase00_runs(organization_id,project_id,actor_id,ticket,operation,idempotency_key,input_sha256)
          VALUES($1,$2,$3,'F00-04','RENDER','bad-fk',$4)`,[orgA,projectB,actorA,'a'.repeat(64)]),/foreign key/);
        await c.query('ROLLBACK');
        assert.equal((await c.query('SELECT * FROM phase00_runs')).rowCount,0,'SET LOCAL must not leak after transaction');
      } finally { await c.query('ROLLBACK'); c.release(); }
    });
    await t.test('fallo de auditoría revierte reserva y outbox atómicamente',async()=>{
      await admin.query(`REVOKE INSERT ON audit_events FROM ${role}`);
      try { await assert.rejects(store.reserve(p,{...request,key:'audit-error'}),/permission denied/); }
      finally { await admin.query(`GRANT INSERT ON audit_events TO ${role}`); }
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM phase00_runs')).rows[0].n,1);
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n,1);
    });
    await t.test('cierre exige tenant; estado terminal y auditoría son inmutables',async()=>{
      await assert.rejects(store.finish({organizationId:orgB,actorId:actorB},id,'SUCCEEDED',{x:1}),/FORBIDDEN/);
      await store.finish(p,id,'BLOCKED_EXTERNAL',{provider:'mock',remote_id:null});
      await assert.rejects(store.finish(p,id,'SUCCEEDED',{x:1}),/NOT_ACTIVE/);
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n,2);
      await assert.rejects(admin.query('UPDATE phase00_runs SET result=$1 WHERE id=$2',[{tampered:true},id]),/immutable/);
      await assert.rejects(admin.query("UPDATE audit_events SET action='tampered'"),/append-only/);
      await assert.rejects(admin.query('DELETE FROM audit_events'),/append-only/);
    });
    await t.test('rollback 003 conserva auditoría y permite reaplicar migración',async()=>{
      await admin.query('BEGIN');
      await admin.query(await readFile('../../db/rollback/003_phase00.sql','utf8'));
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n,2);
      await admin.query(await readFile('../../db/migrations/003_phase00.sql','utf8'));
      await admin.query('ROLLBACK');
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM phase00_runs')).rows[0].n,1);
    });
  } finally { await runtime?.end(); await admin.end(); }
});
