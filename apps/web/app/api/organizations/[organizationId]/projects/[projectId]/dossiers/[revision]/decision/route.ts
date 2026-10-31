import { routeContext } from '../../../../../../../../../src/server/route-helpers';
import { decideDossier } from '../../../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const POST = routeContext(decideDossier);
