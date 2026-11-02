import { routeContext } from '../../../../../../../src/server/route-helpers';
import { createPlan } from '../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(createPlan);
