import { useState, useMemo } from 'react';
import yaml from 'js-yaml';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { CopyIcon, DownloadIcon } from 'lucide-react';
import { useToast } from '../ui/toast';

type OutputFormat = 'json' | 'yaml';

interface YamlPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  yamlContent: string;
}

export function YamlPreviewDialog({ open, onClose, yamlContent }: YamlPreviewDialogProps): React.JSX.Element {
  const { toast } = useToast();
  const [format, setFormat] = useState<OutputFormat>('json');

  const displayedContent = useMemo(() => {
    if (format === 'json') return yamlContent;
    try {
      const parsed = JSON.parse(yamlContent);
      // Convert JSON format to Cube.js YAML schema format:
      // - measures/dimensions/joins: object -> array, key becomes "name" property
      // - Wrap top-level array in { cubes: [...] }
      const toArrayWithName = (obj: Record<string, any> | undefined): any[] | undefined => {
        if (!obj || Object.keys(obj).length === 0) return undefined;
        return Object.entries(obj).map(([key, val]) => ({ name: key, ...val }));
      };

      const cubes = (Array.isArray(parsed) ? parsed : [parsed]).map((cube: any) => ({
        ...cube,
        measures: toArrayWithName(cube.measures),
        dimensions: toArrayWithName(cube.dimensions),
        joins: toArrayWithName(cube.joins),
      }));

      return yaml.dump({ cubes }, { indent: 2, lineWidth: -1, noRefs: true, quotingType: '"' });
    } catch {
      return yamlContent;
    }
  }, [yamlContent, format]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayedContent);
    toast(`${format.toUpperCase()} copied to clipboard`, 'success');
  };

  const handleDownload = () => {
    const isYaml = format === 'yaml';
    const blob = new Blob([displayedContent], { type: isYaml ? 'text/yaml' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isYaml ? 'cube_model.yml' : 'cube_model.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`${format.toUpperCase()} file downloaded`, 'success');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Cube 模型预览</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 justify-end items-center">
            <div className="flex rounded-md border border-gray-300 overflow-hidden">
              <button
                onClick={() => setFormat('json')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${format === 'json' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                JSON
              </button>
              <button
                onClick={() => setFormat('yaml')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-300 ${format === 'yaml' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                YAML
              </button>
            </div>
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
