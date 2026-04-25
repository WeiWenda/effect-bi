import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from 'lucide-react';
import { dagAPI, DagView } from '../services/dagApi';
import { DagDetailPage } from './dag-explore/DagDetailPage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { useToast } from './ui/toast';

function Dags(): React.JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // If an ID is provided, show the detail page
  if (id) {
    return <DagDetailPage dagId={parseInt(id)} onBack={() => navigate('/dags')} />;
  }

  // Otherwise show the list view
  return <DagListView />;
}

function DagListView(): React.JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dagViews, setDagViews] = useState<DagView[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [dagToDelete, setDagToDelete] = useState<DagView | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    const fetchDags = async () => {
      try {
        const response = await dagAPI.getAllDags();
        setDagViews(response.dagViews);
      } catch (error) {
        console.error('Error fetching DAG views:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDags();
  }, []);

  const paginatedDags = dagViews.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalPages = Math.ceil(dagViews.length / pageSize);

  const handleDeleteClick = (dag: DagView) => {
    setDagToDelete(dag);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!dagToDelete) return;

    setDeleting(true);
    try {
      await dagAPI.deleteDag(dagToDelete.id);
      toast('删除成功', 'success');
      setDagViews(prev => prev.filter(d => d.id !== dagToDelete.id));
      setDeleteDialogOpen(false);
      setDagToDelete(null);
    } catch (error) {
      console.error('Error deleting DAG:', error);
      toast('删除失败，请稍后重试', 'error');
    } finally {
      setDeleting(false);
    }
  };

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
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">DAG 视图列表</h1>

        {dagViews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-lg">暂无保存的 DAG 视图</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">名称</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">描述</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">节点数量</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">创建时间</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDags.map((dag) => (
                  <tr
                    key={dag.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td
                      className="px-6 py-4 text-sm text-gray-800 font-medium cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/dags/${dag.id}`)}
                    >
                      {dag.name}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-600 cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/dags/${dag.id}`)}
                    >
                      {dag.description || '-'}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-600 cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/dags/${dag.id}`)}
                    >
                      {dag.nodeIds.length}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-600 cursor-pointer hover:text-blue-600"
                      onClick={() => navigate(`/dags/${dag.id}`)}
                    >
                      {new Date(dag.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(dag);
                        }}
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
                  共 {dagViews.length} 条结果，第 {currentPage} / {totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-700">
              确定要删除 DAG 视图 <span className="font-semibold">{dagToDelete?.name}</span> 吗？
            </p>
            <p className="text-xs text-gray-500 mt-2">此操作无法撤销。</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDagToDelete(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Dags;
