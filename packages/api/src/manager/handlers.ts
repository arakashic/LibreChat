import type { TModelManagerConfig } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import {
  ModelManagerRequestError,
  activateManagedModel,
  cancelModelOperation,
  getManagedModels,
} from './service';

type ModelManagerRequest = ServerRequest & {
  config?: { modelManager?: TModelManagerConfig };
  params: Record<string, string>;
};

function managerConfig(req: ModelManagerRequest): TModelManagerConfig {
  const config = req.config?.modelManager;
  if (config == null) {
    throw new ModelManagerRequestError('Model manager is not configured', 404);
  }
  return config;
}

function canActivate(req: ModelManagerRequest, config: TModelManagerConfig): boolean {
  const role = req.user?.role;
  return typeof role === 'string' && config.activationRoles.includes(role);
}

function sendError(res: Response, error: unknown): Response {
  if (error instanceof ModelManagerRequestError) {
    return res.status(error.status).json({ error: { message: error.message } });
  }
  return res.status(500).json({ error: { message: 'Model manager request failed' } });
}

export async function getManagedModelsHandler(
  req: ModelManagerRequest,
  res: Response,
): Promise<Response> {
  try {
    const config = managerConfig(req);
    return res.json(await getManagedModels(config, canActivate(req, config)));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function activateManagedModelHandler(
  req: ModelManagerRequest,
  res: Response,
): Promise<Response> {
  try {
    const config = managerConfig(req);
    if (!canActivate(req, config)) {
      return res.status(403).json({ error: { message: 'Model activation is not permitted' } });
    }
    const result = await activateManagedModel(config, req.params.modelId);
    return res.status(result.operation.state === 'ready' ? 200 : 202).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function cancelModelOperationHandler(
  req: ModelManagerRequest,
  res: Response,
): Promise<Response> {
  try {
    const config = managerConfig(req);
    if (!canActivate(req, config)) {
      return res.status(403).json({ error: { message: 'Model activation is not permitted' } });
    }
    return res.json(await cancelModelOperation(config, req.params.operationId));
  } catch (error) {
    return sendError(res, error);
  }
}
