import {
  managedModelStatusSchema,
  modelLifecycleStateSchema,
  modelManagerConfigSchema,
  modelManagerStatusSchema,
} from './manager';

describe('model manager schemas', () => {
  test('applies safe configuration defaults', () => {
    const result = modelManagerConfigSchema.parse({
      baseURL: '${MODEL_MANAGER_BASE_URL}',
      apiKey: '${MODEL_MANAGER_API_KEY}',
    });

    expect(result).toEqual({
      baseURL: '${MODEL_MANAGER_BASE_URL}',
      apiKey: '${MODEL_MANAGER_API_KEY}',
      pollIntervalMs: 2000,
      requestTimeoutMs: 10000,
      activationRoles: ['ADMIN'],
    });
  });

  test('accepts every lifecycle state rendered by the selector', () => {
    for (const state of [
      'ready',
      'stopped',
      'queued',
      'loading',
      'starting',
      'failed',
      'cancelled',
      'unknown',
    ]) {
      expect(modelLifecycleStateSchema.parse(state)).toBe(state);
    }
  });

  test('validates a status response', () => {
    const model = managedModelStatusSchema.parse({
      id: 'model-a',
      label: 'Model A',
      pool_id: 'gpu-0',
      state: 'stopped',
      detail: 'Stopped',
      active: false,
      metadata: {},
      operation: null,
    });

    expect(
      modelManagerStatusSchema.parse({
        pools: [
          {
            id: 'gpu-0',
            label: 'GPU 0',
            active_model_id: null,
            models: [model],
            operation: null,
          },
        ],
        can_activate: true,
      }),
    ).toMatchObject({ can_activate: true });
  });
});
