import { routeContext } from '../../../../../../../../../src/server/route-helpers';
import { addLicense } from '../../../../../../../../../src/server/media-api';
export const runtime = 'nodejs';
export const POST = routeContext(addLicense);
