import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, type OrganizationContext, type Permission, type VerifiedIdentity } from '@cluster/contracts';
import { requireIdentity } from './auth';
import { parseConfig } from './config';
import { TenantDatabase, getRuntimePool } from './database';
import { assertSameOrigin, readLimitedBody, requestHandler } from './observability';

export type Params = Record<string, string>;
export type Scope = { client: PoolClient; context: OrganizationContext; params: Params; requestId: string };

export const database = () => new TenantDatabase(getRuntimePool());
export function uuidParam(params: Params, name: string) {
  const parsed = z.uuid().safeParse(params[name]);
  if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
  return parsed.data;
}
export function revisionParam(params: Params) {
  const parsed = z.coerce.number().int().positive().safeParse(params.revision);
  if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
  return parsed.data;
}
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(await readLimitedBody(request)) || '{}'); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError('INVALID_INPUT', 400); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
  return parsed.data;
}
// Orden fijo en toda escritura: origen, sesión, cuerpo y luego autorización dentro de la transacción de tenant.
export const writeRoute = <S extends z.ZodType, R>(name: string, permission: Permission, schema: S, operation: (scope: Scope, body: z.infer<S>) => Promise<R>, status = 201) =>
  (request: Request, params: Params) => requestHandler(request, name, async requestId => {
    assertSameOrigin(request, parseConfig(process.env).BETTER_AUTH_URL);
    const identity = await requireIdentity(request.headers);
    const body = await parseBody(request, schema);
    const result = await database().organizationTransaction(identity, params.organizationId, permission, (client, context) => operation({ client, context, params, requestId }, body));
    return Response.json(result, { status });
  });
export const readRoute = <R>(name: string, permission: Permission, operation: (scope: Scope, query: URLSearchParams) => Promise<R>) =>
  (request: Request, params: Params) => requestHandler(request, name, async requestId => {
    const identity = await requireIdentity(request.headers);
    const result = await database().organizationTransaction(identity, params.organizationId, permission, (client, context) => operation({ client, context, params, requestId }, new URL(request.url).searchParams));
    return Response.json(result);
  });
// Para operaciones con proveedor externo: la llamada ocurre fuera de transacción y gestiona varias por su cuenta.
export const externalRoute = <S extends z.ZodType, R>(name: string, schema: S, operation: (identity: VerifiedIdentity, params: Params, body: z.infer<S>, requestId: string) => Promise<R>) =>
  (request: Request, params: Params) => requestHandler(request, name, async requestId => {
    assertSameOrigin(request, parseConfig(process.env).BETTER_AUTH_URL);
    const identity = await requireIdentity(request.headers);
    return Response.json(await operation(identity, params, await parseBody(request, schema), requestId), { status: 201 });
  });
export const routeContext = <P extends Params>(handler: (request: Request, params: P) => Promise<Response>) =>
  async (request: Request, context: { params: Promise<P> }) => handler(request, await context.params);
