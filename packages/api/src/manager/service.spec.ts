import type { TModelManagerConfig } from 'librechat-data-provider';
import {
  activateManagedModel,
  getManagedModels,
  getModelManagerStartupConfig,
  ModelManagerRequestError,
} from './service';

const config: TModelManagerConfig = {
  baseURL: '${MODEL_MANAGER_BASE_URL}',
  apiKey: '${MODEL_MANAGER_API_KEY}',
  pollIntervalMs: 2000,
  requestTimeoutMs: 10000,
  activationRoles: ['ADMIN'],
};

const operation = {
  id: 'operation-1',
  pool_id: 'gpu-0',
  model_id: 'model-a',
  state: 'loading',
  phase: 'starting',
  message: 'Starting Model A',
  progress: 35,
  error: null,
  previous_model_id: 'model-b',
  created_at: 1,
  updated_at: 2,
  cancel_requested: false,
};

beforeEach(() => {
  process.env.MODEL_MANAGER_BASE_URL = 'http://manager.test/api/v1';
  process.env.MODEL_MANAGER_API_KEY = 'secret-token';
});

afterEach(() => {
  delete process.env.MODEL_MANAGER_BASE_URL;
  delete process.env.MODEL_MANAGER_API_KEY;
});

describe('model manager service', () => {
  test('exposes only safe startup fields', () => {
    expect(getModelManagerStartupConfig(config, 'ADMIN')).toEqual({
      enabled: true,
      pollIntervalMs: 2000,
      canActivate: true,
    });
    expect(getModelManagerStartupConfig(config, 'USER')?.canActivate).toBe(false);
    expect(getModelManagerStartupConfig(undefined, 'ADMIN')).toBeUndefined();
  });

  test('fetches status with server-side authorization', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          pools: [
            {
              id: 'gpu-0',
              label: 'GPU 0',
              active_model_id: 'model-a',
              models: [
                {
                  id: 'model-a',
                  label: 'Model A',
                  pool_id: 'gpu-0',
                  state: 'ready',
                  detail: 'Ready',
                  active: true,
                  metadata: {},
                  operation: null,
                },
              ],
              operation: null,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getManagedModels(config, true, fetchImpl);

    expect(result.can_activate).toBe(true);
    expect(result.pools[0].active_model_id).toBe('model-a');
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('http://manager.test/api/v1/models'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      }),
    );
  });

  test('activates an encoded model id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ operation }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await activateManagedModel(config, 'org/model a', fetchImpl);

    expect(result.operation.id).toBe('operation-1');
    expect(fetchImpl.mock.calls[0][0].toString()).toBe(
      'http://manager.test/api/v1/models/org%2Fmodel%20a/activate',
    );
  });

  test('does not expose upstream response bodies for unknown errors', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response('private diagnostic', { status: 500 }));

    await expect(getManagedModels(config, false, fetchImpl)).rejects.toEqual(
      new ModelManagerRequestError('Model manager returned 500', 500),
    );
  });
});
