import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import debounce from 'lodash/debounce';
import {
  EModelEndpoint,
  PermissionBits,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TManagedModelStatus } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { Endpoint, SelectedValues } from '~/common';
import {
  useGetEndpointsQuery,
  useListAgentsQuery,
  useModelManagerQuery,
  useActivateManagedModelMutation,
  useCancelModelOperationMutation,
} from '~/data-provider';
import {
  useAgentDefaultPermissionLevel,
  useSelectorEffects,
  useKeyDialog,
  useEndpoints,
  useLocalize,
} from '~/hooks';
import { useAgentsMapContext, useAssistantsMapContext, useLiveAnnouncer } from '~/Providers';
import { useModelSelectorChatContext } from './ModelSelectorChatContext';
import useSelectMention from '~/hooks/Input/useSelectMention';
import { filterItems } from './utils';

type ModelSelectorContextType = {
  // State
  searchValue: string;
  selectedValues: SelectedValues;
  endpointSearchValues: Record<string, string>;
  searchResults: (t.TModelSpec | Endpoint)[] | null;
  // LibreChat
  modelSpecs: t.TModelSpec[];
  mappedEndpoints: Endpoint[];
  agentsMap: t.TAgentsMap | undefined;
  assistantsMap: t.TAssistantsMap | undefined;
  endpointsConfig: t.TEndpointsConfig;

  // Functions
  endpointRequiresUserKey: (endpoint: string) => boolean;
  setSelectedValues: React.Dispatch<React.SetStateAction<SelectedValues>>;
  setSearchValue: (value: string) => void;
  setEndpointSearchValue: (endpoint: string, value: string) => void;
  handleSelectSpec: (spec: t.TModelSpec) => void;
  handleSelectEndpoint: (endpoint: Endpoint) => void;
  handleSelectModel: (endpoint: Endpoint, model: string) => void;
  getModelStatus: (modelId?: string | null) => TManagedModelStatus | undefined;
  pendingSpec: t.TModelSpec | null;
  lifecycleDialogOpen: boolean;
  setLifecycleDialogOpen: (open: boolean) => void;
  confirmActivation: () => void;
  cancelActivation: () => void;
  activationPending: boolean;
  activationError: string | null;
  managerStatusLoading: boolean;
  managerStatusError: boolean;
  canActivateModel: boolean;
} & ReturnType<typeof useKeyDialog>;

const ModelSelectorContext = createContext<ModelSelectorContextType | undefined>(undefined);

export function useModelSelectorContext() {
  const context = useContext(ModelSelectorContext);
  if (context === undefined) {
    throw new Error('useModelSelectorContext must be used within a ModelSelectorProvider');
  }
  return context;
}

interface ModelSelectorProviderProps {
  children: React.ReactNode;
  startupConfig: t.TStartupConfig | undefined;
}

export function ModelSelectorProvider({ children, startupConfig }: ModelSelectorProviderProps) {
  const agentsMap = useAgentsMapContext();
  const assistantsMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { endpoint, model, spec, agent_id, assistant_id, getConversation, newConversation } =
    useModelSelectorChatContext();
  const localize = useLocalize();
  const { announcePolite } = useLiveAnnouncer();
  const modelSpecs = useMemo(() => {
    /** Labels are normalized at the startup-config query boundary. */
    const specs = startupConfig?.modelSpecs?.list ?? [];
    if (!agentsMap) {
      return specs;
    }

    /**
     * Filter modelSpecs to only include agents the user has access to.
     * Use agentsMap which already contains permission-filtered agents (consistent with other components).
     */
    return specs.filter((spec) => {
      if (spec.preset?.endpoint === EModelEndpoint.agents && spec.preset?.agent_id) {
        return spec.preset.agent_id in agentsMap;
      }
      /** Keep non-agent modelSpecs */
      return true;
    });
  }, [startupConfig, agentsMap]);

  const permissionLevel = useAgentDefaultPermissionLevel();
  /**
   * Always query the VIEW scope so this shares one cache entry (and one paginated walk)
   * with `useAgentsMap` and `useMentions`. Asking for EDIT here spawned a second full
   * fetch under its own key, holding a duplicate copy of the whole agent list. The
   * marketplace's "my agents" framing is preserved by filtering on `isEditable`, which
   * the list endpoint resolves from the same ACL read it already performs.
   */
  const wantsEditableOnly = permissionLevel === PermissionBits.EDIT;
  const selectAgents = useCallback(
    (data: t.AgentListResponse) => {
      const list = data?.data;
      if (!wantsEditableOnly) {
        return list;
      }
      return list?.filter((agent) => agent.isEditable !== false);
    },
    [wantsEditableOnly],
  );
  const { data: agents = null } = useListAgentsQuery(
    { requiredPermission: PermissionBits.VIEW },
    { select: selectAgents },
  );

  const { mappedEndpoints, endpointRequiresUserKey } = useEndpoints({
    agents,
    assistantsMap,
    startupConfig,
    endpointsConfig,
  });

  const getModelDisplayName = useCallback(
    (endpoint: Endpoint, model: string): string => {
      if (isAgentsEndpoint(endpoint.value)) {
        return endpoint.agentNames?.[model] ?? agentsMap?.[model]?.name ?? model;
      }

      if (isAssistantsEndpoint(endpoint.value)) {
        return endpoint.assistantNames?.[model] ?? model;
      }

      return model;
    },
    [agentsMap],
  );

  const { onSelectEndpoint, onSelectSpec } = useSelectMention({
    // presets,
    modelSpecs,
    getConversation,
    assistantsMap,
    endpointsConfig,
    newConversation,
    returnHandlers: true,
  });

  const managerQuery = useModelManagerQuery(startupConfig?.modelManager);
  const activateModel = useActivateManagedModelMutation();
  const cancelOperation = useCancelModelOperationMutation();
  const managedModels = useMemo(() => {
    const models = new Map<string, TManagedModelStatus>();
    for (const pool of managerQuery.data?.pools ?? []) {
      for (const managedModel of pool.models) {
        models.set(managedModel.id, managedModel);
      }
    }
    return models;
  }, [managerQuery.data]);
  const getModelStatus = useCallback(
    (modelId?: string | null) => (modelId ? managedModels.get(modelId) : undefined),
    [managedModels],
  );
  const [pendingSpec, setPendingSpec] = useState<t.TModelSpec | null>(null);
  const [lifecycleDialogOpen, setLifecycleDialogOpenState] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  // State
  const [selectedValues, setSelectedValues] = useState<SelectedValues>(() => {
    let initialModel = model || '';
    if (isAgentsEndpoint(endpoint) && agent_id) {
      initialModel = agent_id;
    } else if (isAssistantsEndpoint(endpoint) && assistant_id) {
      initialModel = assistant_id;
    }
    return {
      endpoint: endpoint || '',
      model: initialModel,
      modelSpec: spec || '',
    };
  });
  useSelectorEffects({
    agentsMap,
    conversation: endpoint
      ? ({
          endpoint: endpoint ?? null,
          model: model ?? null,
          spec: spec ?? null,
          agent_id: agent_id ?? null,
          assistant_id: assistant_id ?? null,
        } as any)
      : null,
    assistantsMap,
    setSelectedValues,
  });

  const [searchValue, setSearchValueState] = useState('');
  const [endpointSearchValues, setEndpointSearchValues] = useState<Record<string, string>>({});

  const keyProps = useKeyDialog();

  /** Memoized search results */
  const searchResults = useMemo(() => {
    if (!searchValue) {
      return null;
    }
    const allItems = [...modelSpecs, ...mappedEndpoints];
    return filterItems(allItems, searchValue, agentsMap, assistantsMap || {}, localize);
  }, [searchValue, modelSpecs, mappedEndpoints, agentsMap, assistantsMap, localize]);

  const setDebouncedSearchValue = useMemo(
    () =>
      debounce((value: string) => {
        setSearchValueState(value);
      }, 200),
    [],
  );
  const setEndpointSearchValue = useCallback((endpoint: string, value: string) => {
    setEndpointSearchValues((prev) => ({
      ...prev,
      [endpoint]: value,
    }));
  }, []);

  const selectSpec = useCallback(
    (spec: t.TModelSpec) => {
      let model = spec.preset.model ?? null;
      onSelectSpec?.(spec);
      /** Specs arrive with `preset.endpoint` materialized at config load. */
      const endpoint = spec.preset.endpoint ?? null;
      if (isAgentsEndpoint(endpoint)) {
        model = spec.preset.agent_id ?? '';
      } else if (isAssistantsEndpoint(endpoint)) {
        model = spec.preset.assistant_id ?? '';
      }
      setSelectedValues({
        endpoint,
        model,
        modelSpec: spec.name,
      });
    },
    [onSelectSpec],
  );

  const setLifecycleDialogOpen = useCallback((open: boolean) => {
    setLifecycleDialogOpenState(open);
    if (!open) {
      setPendingSpec(null);
      setActivationError(null);
    }
  }, []);

  const handleSelectSpec = useCallback(
    (spec: t.TModelSpec) => {
      if (spec.lifecycle !== true) {
        selectSpec(spec);
        return;
      }
      const status = getModelStatus(spec.preset.model);
      if (status?.state === 'ready') {
        selectSpec(spec);
        return;
      }
      setPendingSpec(spec);
      setActivationError(null);
      setLifecycleDialogOpenState(true);
    },
    [getModelStatus, selectSpec],
  );

  const confirmActivation = useCallback(() => {
    const modelId = pendingSpec?.preset.model;
    if (!modelId) {
      return;
    }
    setActivationError(null);
    activateModel.mutate(modelId, {
      onError: (error) => setActivationError(error.message),
    });
  }, [activateModel, pendingSpec]);

  const cancelActivation = useCallback(() => {
    const operationId = getModelStatus(pendingSpec?.preset.model)?.operation?.id;
    if (!operationId) {
      return;
    }
    setActivationError(null);
    cancelOperation.mutate(operationId, {
      onError: (error) => setActivationError(error.message),
    });
  }, [cancelOperation, getModelStatus, pendingSpec]);

  useEffect(() => {
    if (!lifecycleDialogOpen || pendingSpec == null) {
      return;
    }
    if (getModelStatus(pendingSpec.preset.model)?.state !== 'ready') {
      return;
    }
    selectSpec(pendingSpec);
    setLifecycleDialogOpen(false);
  }, [getModelStatus, lifecycleDialogOpen, pendingSpec, selectSpec, setLifecycleDialogOpen]);

  const handleSelectEndpoint = useCallback(
    (endpoint: Endpoint) => {
      if (!endpoint.hasModels) {
        if (endpoint.value) {
          onSelectEndpoint?.(endpoint.value);
        }
        setSelectedValues({
          endpoint: endpoint.value,
          model: '',
          modelSpec: '',
        });
      }
    },
    [onSelectEndpoint],
  );

  const handleSelectModel = useCallback(
    (endpoint: Endpoint, model: string) => {
      if (isAgentsEndpoint(endpoint.value)) {
        onSelectEndpoint?.(endpoint.value, {
          agent_id: model,
          model: agentsMap?.[model]?.model ?? '',
        });
      } else if (isAssistantsEndpoint(endpoint.value)) {
        onSelectEndpoint?.(endpoint.value, {
          assistant_id: model,
          model: assistantsMap?.[endpoint.value]?.[model]?.model ?? '',
        });
      } else if (endpoint.value) {
        onSelectEndpoint?.(endpoint.value, { model });
      }
      setSelectedValues({
        endpoint: endpoint.value,
        model,
        modelSpec: '',
      });

      const modelDisplayName = getModelDisplayName(endpoint, model);
      const announcement = localize('com_ui_model_selected', { 0: modelDisplayName });
      announcePolite({ message: announcement, isStatus: true });
    },
    [agentsMap, announcePolite, assistantsMap, getModelDisplayName, localize, onSelectEndpoint],
  );

  const value = useMemo(
    () => ({
      searchValue,
      searchResults,
      selectedValues,
      endpointSearchValues,
      agentsMap,
      modelSpecs,
      assistantsMap,
      mappedEndpoints,
      endpointsConfig,
      handleSelectSpec,
      getModelStatus,
      pendingSpec,
      lifecycleDialogOpen,
      setLifecycleDialogOpen,
      confirmActivation,
      cancelActivation,
      activationPending: activateModel.isLoading || cancelOperation.isLoading,
      activationError,
      managerStatusLoading: managerQuery.isLoading,
      managerStatusError: managerQuery.isError,
      canActivateModel:
        managerQuery.data?.can_activate ?? startupConfig?.modelManager?.canActivate ?? false,
      handleSelectModel,
      setSelectedValues,
      handleSelectEndpoint,
      setEndpointSearchValue,
      endpointRequiresUserKey,
      setSearchValue: setDebouncedSearchValue,
      ...keyProps,
    }),
    [
      searchValue,
      searchResults,
      selectedValues,
      endpointSearchValues,
      agentsMap,
      modelSpecs,
      assistantsMap,
      mappedEndpoints,
      endpointsConfig,
      handleSelectSpec,
      getModelStatus,
      pendingSpec,
      lifecycleDialogOpen,
      setLifecycleDialogOpen,
      confirmActivation,
      cancelActivation,
      activateModel.isLoading,
      cancelOperation.isLoading,
      activationError,
      managerQuery.isLoading,
      managerQuery.isError,
      managerQuery.data?.can_activate,
      startupConfig?.modelManager?.canActivate,
      handleSelectModel,
      setSelectedValues,
      handleSelectEndpoint,
      setEndpointSearchValue,
      endpointRequiresUserKey,
      setDebouncedSearchValue,
      keyProps,
    ],
  );

  return <ModelSelectorContext.Provider value={value}>{children}</ModelSelectorContext.Provider>;
}
