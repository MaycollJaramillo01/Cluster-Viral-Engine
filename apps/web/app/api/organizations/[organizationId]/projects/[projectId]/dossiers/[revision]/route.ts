import { routeContext } from '../../../../../../../../src/server/route-helpers';
import { readDossier } from '../../../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const GET = routeContext(readDossier);
