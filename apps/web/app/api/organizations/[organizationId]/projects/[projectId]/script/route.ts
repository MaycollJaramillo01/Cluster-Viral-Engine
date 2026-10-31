import { routeContext } from '../../../../../../../src/server/route-helpers';
import { readCurrent, save } from '../../../../../../../src/server/script-api';
export const runtime = 'nodejs';
export const GET = routeContext(readCurrent);
export const POST = routeContext(save);
