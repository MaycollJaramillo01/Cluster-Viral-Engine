import { routeContext } from '../../../../../../../src/server/route-helpers';
import { readMedia } from '../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const GET = routeContext(readMedia);
