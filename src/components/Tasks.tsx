import { ListTodoIcon } from 'lucide-react';

function Tasks(): React.JSX.Element {
  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      <div className="flex flex-col items-center gap-3">
        <ListTodoIcon className="size-12 text-gray-300" />
        <p className="text-sm">任务开发页面（开发中）</p>
      </div>
    </div>
  );
}

export default Tasks;
