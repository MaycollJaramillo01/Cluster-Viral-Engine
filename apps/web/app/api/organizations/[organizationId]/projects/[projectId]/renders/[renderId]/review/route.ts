import { routeContext } from '../../../../../../../../../src/server/route-helpers';
import { review } from '../../../../../../../../../src/server/render-api';
export const runtime = 'nodejs';
export const GET = routeContext(review);
