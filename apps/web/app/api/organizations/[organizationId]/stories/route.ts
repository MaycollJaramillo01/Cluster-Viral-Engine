import { routeContext } from '../../../../../src/server/route-helpers';
import { listStories, createStory } from '../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const GET = routeContext(listStories);
export const POST = routeContext(createStory);
