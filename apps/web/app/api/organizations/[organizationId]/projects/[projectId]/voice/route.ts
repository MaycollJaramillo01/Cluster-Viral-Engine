import { routeContext } from '../../../../../../../src/server/route-helpers';
import { synthesize } from '../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const POST = routeContext(synthesize);
