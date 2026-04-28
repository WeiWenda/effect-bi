import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseIcon, PlusIcon, Trash2Icon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cubeAPI, CubeInfo } from '../../services/cubeApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';

export function CubeListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cubes, setCubes] = useState<CubeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCubeName, setNewCubeName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cubeToDelete, setCubeToDelete] = useState<CubeInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCubes();
  }, []);

  const fetchCubes = async () => {
    try {
      const response = await cubeAPI.listCubes();
      setCubes(response.cubes);
    } catch (error) {
      console.error('Error fetching cubes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newCubeName.trim()) {
      toast('请输入 Cube 名称', 'error');
      return;
    }
    setCreating(true);
    try {
      await cubeAPI.createCube(newCubeName.trim());
      toast('创建成功', 'success');
      setCreateDialogOpen(false);
      setNewCubeName('');
      await fetchCubes();
      navigate(`/cube/${encodeURIComponent(newCubeName.trim())}`);
    } catch (err: any) {
      if (err?.response?.data?.error === 'Cube name already exists') {
        toast('Cube 名称已存在', 'error');
      } else {
        toast('创建失败', 'error');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClick = (cube: CubeInfo) => {
    setCubeToDelete(cube);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!cubeToDelete) return;
    setDeleting(true);
    try {
      await cubeAPI.deleteCube(cubeToDelete.name);
      toast('删除成功', 'success');
      setCubes(prev => prev.filter(c => c.name !== cubeToDelete.name));
      setDeleteDialogOpen(false);
      setCubeToDelete(null);
    } catch {
      toast('删除失败', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const paginatedCubes = cubes.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = Math.ceil(cubes.length / pageSize);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 p-6 overflow-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <DatabaseIcon className="size-6 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-800">Cube 列表</h1>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <PlusIcon className="size-4 mr-2" />
            新增 Cube
          </Button>
        </div>

        {cubes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <DatabaseIcon className="size-12 mb-4" />
            <p className="text-lg">暂无 Cube</p>
            <p className="text-sm mt-2">点击右上角「新增 Cube」开始创建</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">名称</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">版本数</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">发布状态</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">最近更新</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCubes.map((cube) => (
                  <tr
                    key={cube.name}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td
                      className="px-6 py-4 text-sm text-gray-800 font-medium cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/cube/${encodeURIComponent(cube.name)}`)}
                    >
                      {cube.name}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-600 cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/cube/${encodeURIComponent(cube.name)}`)}
                    >
                      {cube.version_count}
                    </td>
                    <td
                      className="px-6 py-4 text-sm cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/cube/${encodeURIComponent(cube.name)}`)}
                    >
                      {cube.published_at ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">已发布</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">未发布</span>
                      )}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-600 cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/cube/${encodeURIComponent(cube.name)}`)}
                    >
                      {new Date(cube.updated_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(cube); }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                        title="删除"
                      >
                        <Trash2Icon className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-600">
                  共 {cubes.length} 条结果，第 {currentPage} / {totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <span className="text-sm text-gray-600">{currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Cube Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增 Cube</DialogTitle></DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Cube 名称</label>
            <input
              type="text"
              value={newCubeName}
              onChange={e => setNewCubeName(e.target.value)}
              placeholder="请输入 Cube 名称"
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); setNewCubeName(''); }}>取消</Button>
            <Button onClick={handleCreate} disabled={creating || !newCubeName.trim()}>
              {creating ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Cube Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-700">
              确定要删除 Cube <span className="font-semibold">{cubeToDelete?.name}</span> 及其所有版本吗？
            </p>
            <p className="text-xs text-gray-500 mt-2">此操作无法撤销。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setCubeToDelete(null); }}>取消</Button>
            <Button onClick={handleDeleteConfirm} disabled={deleting} className="bg-red-500 hover:bg-red-600">
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
