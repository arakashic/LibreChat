import {
  envVarRegex,
  extractEnvVariable,
  modelManagerStatusSchema,
  modelOperationResponseSchema,
} from 'librechat-data-provider';
import type {
  TModelManagerConfig,
  TModelManagerStatus,
  TModelOperationResponse,
  TModelManagerStartup,
} from 'librechat-data-provider';

export class ModelManagerRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function getModelManagerStartupConfig(
  config: TModelManagerConfig | undefined,
  role: string | undefined,
): TModelManagerStartup | undefined {
  if (config == null) {
    return undefined;
  }
  return {
    enabled: true,
    pollIntervalMs: config.pollIntervalMs,
    canActivate: typeof role === 'string' && config.activationRoles.includes(role),
  };
}

type FetchModelManager = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<globalThis.Response>;

type ResolvedConfig = {
  apiRoot: URL;
  apiKey: string;
  timeoutMs: number;
};

function resolveConfig(config: TModelManagerConfig): ResolvedConfig {
  const baseURL = extractEnvVariable(config.baseURL);
  const apiKey = extractEnvVariable(config.apiKey);
  if (!baseURL || baseURL.match(envVarRegex)) {
    throw new ModelManagerRequestError('Model manager base URL is not configured', 503);
  }
  if (!apiKey || apiKey.match(envVarRegex)) {
    throw new ModelManagerRequestError('Model manager API key is not configured', 503);
  }

  let apiRoot: URL;
  try {
    apiRoot = new URL(baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
  } catch {
    throw new ModelManagerRequestError('Model manager base URL is invalid', 503);
  }
  if (apiRoot.protocol !== 'http:' && apiRoot.protocol !== 'https:') {
    throw new ModelManagerRequestError('Model manager base URL must use HTTP or HTTPS', 503);
  }
  return { apiRoot, apiKey, timeoutMs: config.requestTimeoutMs };
}

async function request(
  config: TModelManagerConfig,
  path: string,
  method: 'GET' | 'POST',
  fetchImpl: FetchModelManager,
): Promise<unknown> {
  const resolved = resolveConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolved.timeoutMs);
  try {
    const response = await fetchImpl(new URL(path, resolved.apiRoot), {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${resolved.apiKey}`,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error =
        payload != null &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error != null &&
        typeof payload.error === 'object' &&
        'message' in payload.error &&
        typeof payload.error.message === 'string'
          ? payload.error.message
          : `Model manager returned ${response.status}`;
      throw new ModelManagerRequestError(error, response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof ModelManagerRequestError) {
      throw error;
    }
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Model manager request timed out'
        : 'Model manager is unavailable';
    throw new ModelManagerRequestError(message, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getManagedModels(
  config: TModelManagerConfig,
  canActivate: boolean,
  fetchImpl: FetchModelManager = fetch,
): Promise<TModelManagerStatus> {
  const payload = await request(config, 'models', 'GET', fetchImpl);
  const result = modelManagerStatusSchema.safeParse({
    ...(payload != null && typeof payload === 'object' ? payload : {}),
    can_activate: canActivate,
  });
  if (!result.success) {
    throw new ModelManagerRequestError('Model manager returned an invalid status response', 502);
  }
  return result.data;
}

export async function activateManagedModel(
  config: TModelManagerConfig,
  modelId: string,
  fetchImpl: FetchModelManager = fetch,
): Promise<TModelOperationResponse> {
  const payload = await request(
    config,
    `models/${encodeURIComponent(modelId)}/activate`,
    'POST',
    fetchImpl,
  );
  const result = modelOperationResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new ModelManagerRequestError('Model manager returned an invalid operation', 502);
  }
  return result.data;
}

export async function cancelModelOperation(
  config: TModelManagerConfig,
  operationId: string,
  fetchImpl: FetchModelManager = fetch,
): Promise<TModelOperationResponse> {
  const payload = await request(
    config,
    `operations/${encodeURIComponent(operationId)}/cancel`,
    'POST',
    fetchImpl,
  );
  const result = modelOperationResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new ModelManagerRequestError('Model manager returned an invalid operation', 502);
  }
  return result.data;
}
