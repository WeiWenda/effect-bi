import { useEffect, useRef, useState, type FC } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  MessageSquareIcon,
  Table2Icon,
} from 'lucide-react';
import {
  usePreDefinedWorkflow,
  WORKFLOW_MODE_OPTIONS,
  type PreDefinedWorkflow,
  type WorkflowModeOption,
} from '@/contexts/PreDefinedWorkflowContext';
import { cn } from '@/lib/utils';

const WORKFLOW_ICONS: Record<PreDefinedWorkflow, FC<{ className?: string }>> = {
  default: MessageSquareIcon,
  findResource: Table2Icon,
};

function WorkflowModeMenuItem({
  option,
  selected,
  onSelect,
}: {
  option: WorkflowModeOption;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  const Icon = WORKFLOW_ICONS[option.value];

  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'aui-workflow-mode-item flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        selected ? 'bg-stone-100' : 'hover:bg-stone-50',
      )}
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-stone-700">
        {selected ? (
          <CheckIcon className="size-4 stroke-[2.5px]" aria-hidden />
        ) : (
          <Icon className="size-4 stroke-[1.75px]" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-stone-900">{option.title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-stone-500">{option.description}</span>
      </span>
    </button>
  );
}

export const WorkflowModeSelect: FC = () => {
  const { workflow, setWorkflow } = usePreDefinedWorkflow();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedOption =
    WORKFLOW_MODE_OPTIONS.find((o) => o.value === workflow) ?? WORKFLOW_MODE_OPTIONS[0];
  const SelectedIcon = WORKFLOW_ICONS[selectedOption.value];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="aui-workflow-mode-select relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'aui-workflow-mode-trigger inline-flex h-8.5 items-center gap-1.5 rounded-full border border-stone-200/80',
          'bg-stone-100/90 px-3 text-sm font-medium text-stone-800 shadow-sm',
          'transition-colors hover:bg-stone-200/70',
          open && 'bg-stone-200/80',
        )}
      >
        <SelectedIcon className="size-4 shrink-0 stroke-[1.75px] text-stone-600" aria-hidden />
        <span className="max-w-[7rem] truncate">{selectedOption.title}</span>
        <ChevronDownIcon
          className={cn('size-4 shrink-0 text-stone-500 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="选择对话模式"
          className={cn(
            'aui-workflow-mode-menu absolute bottom-full left-0 z-50 mb-2 w-[min(18rem,calc(100vw-2rem))]',
            'overflow-hidden rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg',
          )}
        >
          {WORKFLOW_MODE_OPTIONS.map((option) => (
            <WorkflowModeMenuItem
              key={option.value}
              option={option}
              selected={workflow === option.value}
              onSelect={() => {
                setWorkflow(option.value);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
