import { z } from 'zod';

export const modelManagerConfigSchema = z
  .object({
    baseURL: z.string().min(1),
    apiKey: z.string().min(1),
    pollIntervalMs: z.number().int().min(1000).max(60_000).default(2000),
    requestTimeoutMs: z.number().int().min(1000).max(120_000).default(10_000),
    activationRoles: z.array(z.string().min(1)).min(1).default(['ADMIN']),
  })
  .strict();

export type TModelManagerConfig = z.infer<typeof modelManagerConfigSchema>;

export const modelLifecycleStateSchema = z.enum([
  'ready',
  'stopped',
  'queued',
  'loading',
  'starting',
  'failed',
  'cancelled',
  'unknown',
]);

export type ModelLifecycleState = z.infer<typeof modelLifecycleStateSchema>;

export const modelOperationSchema = z.object({
  id: z.string(),
  pool_id: z.string(),
  model_id: z.string(),
  state: z.string(),
  phase: z.string(),
  message: z.string(),
  progress: z.number().min(0).max(100),
  error: z.string().nullable(),
  previous_model_id: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  cancel_requested: z.boolean(),
});

export type TModelOperation = z.infer<typeof modelOperationSchema>;

export const managedModelStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  pool_id: z.string(),
  state: modelLifecycleStateSchema,
  detail: z.string(),
  active: z.boolean(),
  metadata: z.record(z.unknown()),
  operation: modelOperationSchema.nullable(),
});

export type TManagedModelStatus = z.infer<typeof managedModelStatusSchema>;

export const modelPoolStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  active_model_id: z.string().nullable(),
  models: z.array(managedModelStatusSchema),
  operation: modelOperationSchema.nullable(),
});

export const modelManagerStatusSchema = z.object({
  pools: z.array(modelPoolStatusSchema),
  can_activate: z.boolean(),
});

export type TModelManagerStatus = z.infer<typeof modelManagerStatusSchema>;

export const modelOperationResponseSchema = z.object({
  operation: modelOperationSchema,
});

export type TModelOperationResponse = z.infer<typeof modelOperationResponseSchema>;

export type TModelManagerStartup = {
  enabled: true;
  pollIntervalMs: number;
  canActivate: boolean;
};
