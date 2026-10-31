import { routeContext } from '../../../../../../../../../src/server/route-helpers';
import { decide } from '../../../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const POST = routeContext(decide);
