import { routeContext } from '../../../../../../../src/server/route-helpers';
import { addSource } from '../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(addSource);
