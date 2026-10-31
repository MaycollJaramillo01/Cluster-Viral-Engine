import { routeContext } from '../../../../../../../../src/server/route-helpers';
import { assignMusic } from '../../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const PUT = routeContext(assignMusic);
