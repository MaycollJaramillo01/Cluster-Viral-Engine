import { routeContext } from '../../../../../../src/server/route-helpers';
import { readProject } from '../../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const GET = routeContext(readProject);
