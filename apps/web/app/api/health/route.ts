import { requestHandler } from '../../../src/server/observability';
export const runtime = 'nodejs';
export const GET = (request: Request) => requestHandler(request, 'health.live', async () => Response.json({ status: 'ok', publication_enabled: false }));
