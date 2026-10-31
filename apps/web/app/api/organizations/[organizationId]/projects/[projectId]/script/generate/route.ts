import { routeContext } from '../../../../../../../../src/server/route-helpers';
import { generate } from '../../../../../../../../src/server/script-api';
export const runtime = 'nodejs';
export const POST = routeContext(generate);
