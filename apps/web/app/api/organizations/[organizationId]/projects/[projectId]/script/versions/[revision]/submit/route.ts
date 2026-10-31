import { routeContext } from '../../../../../../../../../../src/server/route-helpers';
import { submit } from '../../../../../../../../../../src/server/script-api';
export const runtime = 'nodejs';
export const POST = routeContext(submit);
