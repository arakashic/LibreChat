import { fireEvent, render, screen } from '@testing-library/react';
import type { TManagedModelStatus, TModelSpec } from 'librechat-data-provider';
import LifecycleDialog from '../LifecycleDialog';

const mockConfirmActivation = jest.fn();
const mockCancelActivation = jest.fn();
const mockSetLifecycleDialogOpen = jest.fn();
let mockStatus: TManagedModelStatus | undefined;
let mockCanActivateModel = true;

const mockPendingSpec: TModelSpec = {
  name: 'managed-model',
  label: 'Managed Model',
  lifecycle: true,
  preset: { endpoint: 'Local', model: 'model-a' },
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, string>) =>
    values?.[0] ? `${key}:${values[0]}` : key,
}));

jest.mock('../ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    activationError: null,
    activationPending: false,
    canActivateModel: mockCanActivateModel,
    cancelActivation: mockCancelActivation,
    confirmActivation: mockConfirmActivation,
    getModelStatus: () => mockStatus,
    lifecycleDialogOpen: true,
    managerStatusError: false,
    managerStatusLoading: false,
    pendingSpec: mockPendingSpec,
    setLifecycleDialogOpen: mockSetLifecycleDialogOpen,
  }),
}));

describe('LifecycleDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanActivateModel = true;
    mockStatus = {
      id: 'model-a',
      label: 'Managed Model',
      pool_id: 'gpu-0',
      state: 'stopped',
      detail: 'Stopped',
      active: false,
      metadata: {},
      operation: null,
    };
  });

  test('confirms loading a stopped model', () => {
    render(<LifecycleDialog />);

    expect(screen.getByText('com_ui_model_activation_title:Managed Model')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_model_activation_start' }));
    expect(mockConfirmActivation).toHaveBeenCalledTimes(1);
  });

  test('shows progress and supports cancellation', () => {
    mockStatus = {
      ...mockStatus!,
      state: 'loading',
      operation: {
        id: 'operation-1',
        pool_id: 'gpu-0',
        model_id: 'model-a',
        state: 'loading',
        phase: 'loading',
        message: 'Loading weights',
        progress: 57,
        error: null,
        previous_model_id: 'model-b',
        created_at: 1,
        updated_at: 2,
        cancel_requested: false,
      },
    };

    render(<LifecycleDialog />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '57');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_model_activation_cancel' }));
    expect(mockCancelActivation).toHaveBeenCalledTimes(1);
  });

  test('explains when the user cannot activate models', () => {
    mockCanActivateModel = false;
    render(<LifecycleDialog />);

    expect(screen.getByText('com_ui_model_activation_not_permitted')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_model_activation_start' }),
    ).not.toBeInTheDocument();
  });
});
