import { routeContext } from '../../../../../../../src/server/route-helpers';
import { addClaim } from '../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(addClaim);
