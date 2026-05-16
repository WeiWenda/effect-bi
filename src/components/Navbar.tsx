import { useNavigate, useLocation } from 'react-router-dom';
import {
  MessageSquareIcon,
  Table2Icon,
  BoxIcon,
  ZapIcon,
  BarChart3Icon,
  LayoutDashboardIcon,
  GitBranchIcon,
  LogOutIcon,
  UserIcon,
} from 'lucide-react';
import { tokenStorage } from '../services/llmApi';
import { isMetaOnlyMode } from '../config/appMode';

function Navbar(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = (): void => {
    tokenStorage.clearUserToken();
    tokenStorage.clearSessionToken();
    localStorage.removeItem('user');
    navigate('/login');
  };

  const isActive = (path: string): boolean => {
    if (path === '/lineage') {
      return location.pathname.startsWith('/lineage');
    }
    if (path === '/dags') {
      return location.pathname.startsWith('/dags');
    }
    if (path === '/cube') {
      return location.pathname.startsWith('/cube');
    }
    if (path === '/query') {
      return location.pathname.startsWith('/query');
    }
    if (path === '/dashboard') {
      return location.pathname.startsWith('/dashboard');
    }
    if (path === '/etl') {
      return location.pathname.startsWith('/etl');
    }
    return location.pathname === path;
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
        <button
          onClick={() => navigate('/chat')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive('/chat')
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquareIcon className="size-4" />
          Chat
        </button>
        {!isMetaOnlyMode && (
          <button
            onClick={() => navigate('/etl')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive('/etl')
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ZapIcon className="size-4" />
            ETL
          </button>
        )}
        <button
          onClick={() => navigate('/lineage')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive('/lineage')
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Table2Icon className="size-4" />
          Table Meta
        </button>
        {!isMetaOnlyMode && (
          <>
            <button
              onClick={() => navigate('/cube')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive('/cube')
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BoxIcon className="size-4" />
              Cube
            </button>
            <button
              onClick={() => navigate('/query')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive('/query')
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart3Icon className="size-4" />
              可视化查询
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive('/dashboard')
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutDashboardIcon className="size-4" />
              看板
            </button>
          </>
        )}
        <button
          onClick={() => navigate('/dags')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive('/dags')
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <GitBranchIcon className="size-4" />
          链路治理
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <UserIcon className="size-4" />
        </div>
        <span className="truncate text-sm text-gray-600">用户</span>
        <button
          onClick={handleLogout}
          className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="退出登录"
        >
          <LogOutIcon className="size-4" />
        </button>
      </div>
    </header>
  );
}

export default Navbar;
