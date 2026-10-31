import { routeContext } from '../../../../../../../src/server/route-helpers';
import { list, upload } from '../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const GET = routeContext(list);
export const POST = routeContext(upload);
