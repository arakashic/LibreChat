import {
  Button,
  Spinner,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import { useModelSelectorContext } from './ModelSelectorContext';
import { useLocalize } from '~/hooks';

const transitioning = new Set(['queued', 'loading', 'starting']);

export default function LifecycleDialog() {
  const localize = useLocalize();
  const {
    activationError,
    activationPending,
    canActivateModel,
    cancelActivation,
    confirmActivation,
    getModelStatus,
    lifecycleDialogOpen,
    managerStatusError,
    managerStatusLoading,
    pendingSpec,
    setLifecycleDialogOpen,
  } = useModelSelectorContext();

  const modelId = pendingSpec?.preset.model;
  const status = getModelStatus(modelId);
  const operation = status?.operation;
  const isTransitioning = status != null && transitioning.has(status.state);
  const canStart = status != null && !isTransitioning && status.state !== 'ready';
  const progress = operation?.progress ?? (isTransitioning ? 5 : 0);

  let message = localize('com_ui_model_status_checking');
  if (managerStatusError || (!managerStatusLoading && status == null)) {
    message = localize('com_ui_model_manager_unavailable');
  } else if (operation?.message) {
    message = operation.message;
  } else if (status?.state === 'stopped') {
    message = localize('com_ui_model_activation_confirm');
  } else if (status?.state === 'failed') {
    message = operation?.error || localize('com_ui_model_activation_failed');
  } else if (status?.state === 'cancelled') {
    message = localize('com_ui_model_status_cancelled');
  }

  return (
    <OGDialog open={lifecycleDialogOpen} onOpenChange={setLifecycleDialogOpen}>
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={!isTransitioning}>
        <OGDialogHeader>
          <OGDialogTitle>
            {localize('com_ui_model_activation_title', { 0: pendingSpec?.label ?? '' })}
          </OGDialogTitle>
        </OGDialogHeader>
        <div className="space-y-3 text-sm text-text-secondary">
          <p>{message}</p>
          <p>{localize('com_ui_model_activation_global_warning')}</p>
          {isTransitioning && (
            <div className="space-y-1">
              <div
                role="progressbar"
                aria-label={localize('com_ui_model_activation_progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-2 overflow-hidden rounded-full bg-surface-tertiary"
              >
                <div
                  className="h-full bg-status-info transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-xs text-text-secondary">{progress}%</div>
            </div>
          )}
          {activationError && (
            <p role="alert" className="text-status-error">
              {activationError}
            </p>
          )}
          {!canActivateModel && canStart && (
            <p role="alert" className="text-status-warning">
              {localize('com_ui_model_activation_not_permitted')}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLifecycleDialogOpen(false)}>
            {localize(isTransitioning ? 'com_ui_close' : 'com_ui_cancel')}
          </Button>
          {isTransitioning && canActivateModel && (
            <Button variant="destructive" onClick={cancelActivation} disabled={activationPending}>
              {activationPending ? <Spinner className="size-4" /> : null}
              {localize('com_ui_model_activation_cancel')}
            </Button>
          )}
          {canStart && canActivateModel && !managerStatusError && (
            <Button onClick={confirmActivation} disabled={activationPending}>
              {activationPending ? <Spinner className="size-4" /> : null}
              {localize('com_ui_model_activation_start')}
            </Button>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
