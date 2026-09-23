import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys } from 'librechat-data-provider';
import type {
  TModelManagerStartup,
  TModelManagerStatus,
  TModelOperationResponse,
} from 'librechat-data-provider';

export function useModelManagerQuery(config: TModelManagerStartup | undefined) {
  return useQuery<TModelManagerStatus>(
    [QueryKeys.modelManager],
    () => dataService.getManagedModels(),
    {
      enabled: config?.enabled === true,
      refetchInterval: config?.pollIntervalMs,
      refetchOnMount: 'always',
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  );
}

export function useActivateManagedModelMutation() {
  const queryClient = useQueryClient();
  return useMutation<TModelOperationResponse, Error, string>(
    (modelId) => dataService.activateManagedModel(modelId),
    {
      mutationKey: [MutationKeys.activateManagedModel],
      onSuccess: (result) => {
        queryClient.setQueryData<TModelManagerStatus>([QueryKeys.modelManager], (current) => {
          if (current == null) {
            return current;
          }
          return {
            ...current,
            pools: current.pools.map((pool) =>
              pool.id === result.operation.pool_id
                ? { ...pool, operation: result.operation }
                : pool,
            ),
          };
        });
        queryClient.invalidateQueries([QueryKeys.modelManager]);
      },
    },
  );
}

export function useCancelModelOperationMutation() {
  const queryClient = useQueryClient();
  return useMutation<TModelOperationResponse, Error, string>(
    (operationId) => dataService.cancelModelOperation(operationId),
    {
      mutationKey: [MutationKeys.cancelModelOperation],
      onSuccess: () => queryClient.invalidateQueries([QueryKeys.modelManager]),
    },
  );
}
