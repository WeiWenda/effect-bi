import { createContext, useContext, type ReactNode } from 'react';

export type PreDefinedWorkflow = 'default' | 'findResource';

export interface WorkflowModeOption {
  value: PreDefinedWorkflow;
  title: string;
  description: string;
}

export const WORKFLOW_MODE_OPTIONS: WorkflowModeOption[] = [
  {
    value: 'default',
    title: '对话模式',
    description: '默认的通用对话助手',
  },
  {
    value: 'findResource',
    title: '找表模式',
    description: '快速查找并定位资源表',
  },
];

interface PreDefinedWorkflowContextValue {
  workflow: PreDefinedWorkflow;
  setWorkflow: (workflow: PreDefinedWorkflow) => void;
}

const PreDefinedWorkflowContext = createContext<PreDefinedWorkflowContextValue | null>(null);

export function PreDefinedWorkflowProvider({
  workflow,
  setWorkflow,
  children,
}: PreDefinedWorkflowContextValue & { children: ReactNode }): React.JSX.Element {
  return (
    <PreDefinedWorkflowContext.Provider value={{ workflow, setWorkflow }}>
      {children}
    </PreDefinedWorkflowContext.Provider>
  );
}

export function usePreDefinedWorkflow(): PreDefinedWorkflowContextValue {
  const ctx = useContext(PreDefinedWorkflowContext);
  if (!ctx) {
    throw new Error('usePreDefinedWorkflow must be used within PreDefinedWorkflowProvider');
  }
  return ctx;
}
