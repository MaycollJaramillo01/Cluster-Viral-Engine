import { routeContext } from '../../../../../../../../../src/server/route-helpers';
import { readVersion } from '../../../../../../../../../src/server/script-api';
export const runtime = 'nodejs';
export const GET = routeContext(readVersion);
