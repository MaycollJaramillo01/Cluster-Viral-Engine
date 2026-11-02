import { routeContext } from '../../../../../../src/server/route-helpers';
import { proposeStories } from '../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(proposeStories);
