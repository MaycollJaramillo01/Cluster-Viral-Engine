import { organization } from '../../../../../src/server/foundation-api';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  return organization(request, (await context.params).organizationId);
}
