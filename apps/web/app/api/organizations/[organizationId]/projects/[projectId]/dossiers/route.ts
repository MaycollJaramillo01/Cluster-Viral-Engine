import { routeContext } from '../../../../../../../src/server/route-helpers';
import { freezeDossier } from '../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(freezeDossier);
