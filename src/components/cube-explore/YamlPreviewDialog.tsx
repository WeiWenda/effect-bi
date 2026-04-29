import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { CopyIcon, DownloadIcon } from 'lucide-react';
import { useToast } from '../ui/toast';

type PreviewTab = 'model' | 'view';
type ModelFormat = 'json' | 'yaml';

interface YamlPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  modelJson: string;
  modelYml: string;
  modelView: string;
  initialTab?: PreviewTab;
}

export function YamlPreviewDialog({ open, onClose, modelJson, modelYml, modelView, initialTab = 'model' }: YamlPreviewDialogProps): React.JSX.Element {
  const { toast } = useToast();
  const [tab, setTab] = useState<PreviewTab>(initialTab);
  const [modelFormat, setModelFormat] = useState<ModelFormat>('yaml');

  const displayedContent = useMemo(() => {
    if (tab === 'view') return modelView || '';
    // Model tab
    if (modelFormat === 'json') return modelJson;
    // yaml: use pre-generated modelYml if available, otherwise fallback
    return modelYml || modelJson;
  }, [tab, modelFormat, modelJson, modelYml, modelView]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayedContent);
    toast('已复制到剪贴板', 'success');
  };

  const handleDownload = () => {
    const isYaml = tab === 'view' || modelFormat === 'yaml';
    const blob = new Blob([displayedContent], { type: isYaml ? 'text/yaml' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab === 'view' ? 'cube_view.yml' : isYaml ? 'cube_model.yml' : 'cube_model.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('文件已下载', 'success');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Cube 模型预览</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 justify-end items-center">
            {/* Tab switcher: Model / View */}
            <div className="flex rounded-md border border-gray-300 overflow-hidden mr-auto">
              <button
                onClick={() => setTab('model')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'model' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Model
              </button>
              <button
                onClick={() => setTab('view')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-300 ${tab === 'view' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                View
              </button>
            </div>
            {/* Format switcher: only for Model tab */}
            {tab === 'model' && (
              <div className="flex rounded-md border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setModelFormat('yaml')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${modelFormat === 'yaml' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  YAML
                </button>
                <button
                  onClick={() => setModelFormat('json')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-300 ${modelFormat === 'json' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  JSON
                </button>
              </div>
            )}
            <Button onClick={handleCopy} size="sm" variant="outline">
              <CopyIcon className="size-4 mr-2" />复制
            </Button>
            <Button onClick={handleDownload} size="sm">
              <DownloadIcon className="size-4 mr-2" />下载
            </Button>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[60vh]">
            <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap">
              {displayedContent}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
