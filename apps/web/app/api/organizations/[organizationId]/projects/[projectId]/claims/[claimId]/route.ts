import { routeContext } from '../../../../../../../../src/server/route-helpers';
import { updateClaim } from '../../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const PUT = routeContext(updateClaim);
