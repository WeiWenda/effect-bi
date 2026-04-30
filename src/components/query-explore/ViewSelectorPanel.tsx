import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2Icon, HashIcon, ClockIcon, TypeIcon, ToggleLeftIcon, PencilIcon } from 'lucide-react';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import { Select } from '../ui/select';
import type { CubeMeta, CubeMember } from '../../types/chart';

interface ViewSelectorPanelProps {
  selectedView: string | null;
  onViewSelect: (viewName: string, cube: CubeMeta) => void;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  string: <TypeIcon className="size-3.5 text-blue-500" />,
  number: <HashIcon className="size-3.5 text-green-500" />,
  time: <ClockIcon className="size-3.5 text-orange-500" />,
  boolean: <ToggleLeftIcon className="size-3.5 text-purple-500" />,
};

function getFieldIcon(type: string): React.ReactNode {
  const lower = type.toLowerCase();
  if (lower.includes('time') || lower.includes('date') || lower.includes('timestamp')) return TYPE_ICON.time;
  if (lower.includes('int') || lower.includes('decimal') || lower.includes('float') || lower.includes('double') || lower.includes('numeric') || lower === 'number') return TYPE_ICON.number;
  if (lower.includes('bool')) return TYPE_ICON.boolean;
  return TYPE_ICON.string;
}

export function ViewSelectorPanel({ selectedView, onViewSelect }: ViewSelectorPanelProps): React.JSX.Element {
  const navigate = useNavigate();
  const [cubes, setCubes] = useState<CubeMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCube, setSelectedCube] = useState<CubeMeta | null>(null);

  useEffect(() => {
    loadCubes();
  }, []);

  // Sync selectedCube when cubes are loaded or selectedView changes
  useEffect(() => {
    if (selectedView && cubes.length > 0) {
      const cube = cubes.find(c => c.name === selectedView);
      if (cube && cube !== selectedCube) {
        setSelectedCube(cube);
      }
    }
  }, [selectedView, cubes]);

  const loadCubes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await cubeProxyAPI.meta();
      setCubes(response.cubes || []);
    } catch (err) {
      console.error('Error loading cubes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleViewChange = (viewName: string) => {
    const cube = cubes.find(c => c.name === viewName);
    if (cube) {
      setSelectedCube(cube);
      onViewSelect(cube.name, cube);
    }
  };

  const handleDragStart = (e: React.DragEvent, member: CubeMember, memberType: 'dimension' | 'measure') => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      name: member.name,
      title: member.shortTitle || member.title || member.name,
      type: member.type,
      memberType,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Filter to only views
  const views = cubes.filter(c => c.type === 'view');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2Icon className="size-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Views</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select
              value={selectedView || ''}
              onChange={val => val && handleViewChange(val)}
              options={views.map(v => ({ value: v.name, label: v.title || v.name }))}
              placeholder="选择 View"
            />
          </div>
          {selectedView && (
            <button
              onClick={() => navigate(`/cube/${encodeURIComponent(selectedView)}`)}
              className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
              title="编辑 Cube"
            >
              <PencilIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedCube ? (
          <>
            {selectedCube.dimensions.length > 0 && (
              <div className="h-1/2 flex flex-col border-b border-gray-200">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-1.5 shrink-0">维度</div>
                <div className="flex-1 overflow-auto">
                  {selectedCube.dimensions.map(dim => (
                    <div
                      key={dim.name}
                      draggable
                      onDragStart={e => handleDragStart(e, dim, 'dimension')}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 rounded hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors mx-2"
                    >
                      {getFieldIcon(dim.type)}
                      <span className="truncate">{dim.shortTitle || dim.title || dim.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedCube.measures.length > 0 && (
              <div className="h-1/2 flex flex-col">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-1.5 shrink-0">指标</div>
                <div className="flex-1 overflow-auto">
                  {selectedCube.measures.map(meas => (
                    <div
                      key={meas.name}
                      draggable
                      onDragStart={e => handleDragStart(e, meas, 'measure')}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 rounded hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors mx-2"
                    >
                      <HashIcon className="size-3.5 text-green-500" />
                      <span className="truncate">{meas.shortTitle || meas.title || meas.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-gray-400 text-center py-8">请选择一个 View</div>
        )}
      </div>
    </div>
  );
}
