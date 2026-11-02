import { routeContext } from '../../../../../../../src/server/route-helpers';
import { selectStory } from '../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(selectStory);
