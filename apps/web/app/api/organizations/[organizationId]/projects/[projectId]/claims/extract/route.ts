import { routeContext } from '../../../../../../../../src/server/route-helpers';
import { extractClaims } from '../../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(extractClaims);
