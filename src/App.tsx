import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Register from './components/Register';
import Login from './components/Login';
import Chat from './components/Chat';
import Lineage from './components/Lineage';
import Tasks from './components/Tasks';
import { TableDetailPage } from './components/lineage-explore/TableDetailPage';
import Navbar from './components/Navbar';
import { TooltipProvider } from './components/ui/tooltip';
import { ToastProvider } from './components/ui/toast';
import { tokenStorage } from './services/llmApi';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps): React.ReactNode {
  const token = tokenStorage.getUserToken();
  if (!token) {
    return <Navigate to="/login" />;
  }
  return children;
}

interface PublicRouteProps {
  children: React.ReactNode;
}

function PublicRoute({ children }: PublicRouteProps): React.ReactNode {
  const token = tokenStorage.getUserToken();
  if (token) {
    return <Navigate to="/chat" />;
  }
  return children;
}

function MainLayout(): React.JSX.Element {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="chat" element={<Chat />} />
              <Route path="lineage" element={<Lineage />} />
              <Route path="lineage/table/:tableName" element={<TableDetailPage />} />
              <Route path="tasks" element={<Tasks />} />
              <Route index element={<Navigate to="/chat" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ToastProvider>
  );
}

export default App;
