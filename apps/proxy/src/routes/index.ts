import { H3Event } from 'h3';
import { getBodyBuffer } from '@/utils/body';
import {
  getProxyHeaders,
  getAfterResponseHeaders,
  getBlacklistedHeaders,
} from '@/utils/headers';
import {
  createTokenIfNeeded,
  isAllowedToMakeRequest,
  setTokenHeader,
} from '@/utils/turnstile';
import { validateDestination } from '@/utils/validateDestination';

export default defineEventHandler(async (event: H3Event) => {
  if (isPreflightRequest(event) || event.method === 'OPTIONS') {
    event.node.res.statusCode = 204;
    return '';
  }



  // Parse destination URL
  const destination = getQuery<{ destination?: string }>(event).destination;
  if (!destination) {
    return await sendJson({
      event,
      status: 200,
      data: {
        message: `Proxy is working as expected (v${
          useRuntimeConfig(event).version
        })`,
      },
    });
  }

  // Check if allowed to make the request
  if (!(await isAllowedToMakeRequest(event))) {
    return await sendJson({
      event,
      status: 401,
      data: {
        error: 'Invalid or missing token',
      },
    });
  }

  // Read body and create token if needed
  const body = await getBodyBuffer(event);
  const token = await createTokenIfNeeded(event);

  // Validate destination to block SSRF
  validateDestination(destination);

  // Proxy the request
  try {
    await specificProxyRequest(event, destination, {
      blacklistedHeaders: getBlacklistedHeaders(),
      fetchOptions: {
        redirect: 'follow',
        headers: getProxyHeaders(event.headers),
        body: body as any,
      },
      onResponse(outputEvent: H3Event, response) {
        const headers = getAfterResponseHeaders(response.headers, response.url);
        setResponseHeaders(outputEvent, headers);
        if (token) setTokenHeader(event, token);
      },
    });
  } catch (e) {
    console.log('Error fetching', e);
    throw e;
  }
});