import { routeContext } from '../../../../../src/server/route-helpers';
import { listReferences, createReference } from '../../../../../src/server/research-api';
export const runtime = 'nodejs';
export const GET = routeContext(listReferences);
export const POST = routeContext(createReference);
