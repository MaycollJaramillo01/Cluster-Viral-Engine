import { routeContext } from '../../../../../../../../src/server/route-helpers';
import { read } from '../../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const GET = routeContext(read);
