import { routeContext } from '../../../../../../../../../src/server/route-helpers';
import { updateSection } from '../../../../../../../../../src/server/script-api';
export const runtime = 'nodejs';
export const PUT = routeContext(updateSection);
