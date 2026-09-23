import { Chip } from '@librechat/client';
import type { ModelLifecycleState, TManagedModelStatus } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const presentations: Record<
  ModelLifecycleState,
  { tone: 'neutral' | 'info' | 'success' | 'warning' | 'error'; label: TranslationKeys }
> = {
  ready: { tone: 'success', label: 'com_ui_model_status_ready' },
  stopped: { tone: 'neutral', label: 'com_ui_model_status_stopped' },
  queued: { tone: 'info', label: 'com_ui_model_status_loading' },
  loading: { tone: 'info', label: 'com_ui_model_status_loading' },
  starting: { tone: 'info', label: 'com_ui_model_status_loading' },
  failed: { tone: 'error', label: 'com_ui_model_status_failed' },
  cancelled: { tone: 'warning', label: 'com_ui_model_status_cancelled' },
  unknown: { tone: 'warning', label: 'com_ui_model_status_unavailable' },
};

export default function ModelStatus({
  status,
  checking,
}: {
  status: TManagedModelStatus | undefined;
  checking: boolean;
}) {
  const localize = useLocalize();
  if (checking) {
    return <Chip tone="neutral">{localize('com_ui_model_status_checking')}</Chip>;
  }
  const presentation = presentations[status?.state ?? 'unknown'];
  return <Chip tone={presentation.tone}>{localize(presentation.label)}</Chip>;
}
