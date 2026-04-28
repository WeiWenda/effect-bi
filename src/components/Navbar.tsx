import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquareIcon, NetworkIcon, ListTodoIcon, BoxIcon, ZapIcon, LogOutIcon, UserIcon } from 'lucide-react';
import { tokenStorage } from '../services/llmApi';

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
    if (path === '/etl') {
      return location.pathname.startsWith('/etl');
    }
    return location.pathname === path;
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
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
        <button
          onClick={() => navigate('/lineage')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive('/lineage')
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <NetworkIcon className="size-4" />
          Lineage
        </button>
        <button
          onClick={() => navigate('/dags')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive('/dags')
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ListTodoIcon className="size-4" />
          DAG
        </button>
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
