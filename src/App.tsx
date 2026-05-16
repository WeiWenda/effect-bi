import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Register from './components/Register';
import Login from './components/Login';
import Chat from './components/Chat';
import { LineageLayout, LineageSearchPage, TableDetailPage } from './components/Lineage';
import Dags from './components/Dags';
import Cubes from './components/Cubes';
import Query from './components/Query';
import Dashboard from './components/Dashboard';
import { ETL } from './components/ETL';
import Navbar from './components/Navbar';
import { MetaOnlyRouteGuard } from './components/MetaOnlyRouteGuard';
import { TooltipProvider } from './components/ui/tooltip';
import { ToastProvider } from './components/ui/toast';
import { defaultAppPath } from './config/appMode';
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
    return <Navigate to={defaultAppPath} />;
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
              <Route path="lineage" element={<LineageLayout />}>
                <Route index element={<LineageSearchPage />} />
                <Route path="table/:tableName" element={<TableDetailPage />} />
              </Route>
              <Route path="dags" element={<Dags />} />
              <Route path="dags/:id" element={<Dags />} />
              <Route
                path="cube"
                element={
                  <MetaOnlyRouteGuard>
                    <Cubes />
                  </MetaOnlyRouteGuard>
                }
              />
              <Route
                path="cube/:name"
                element={
                  <MetaOnlyRouteGuard>
                    <Cubes />
                  </MetaOnlyRouteGuard>
                }
              />
              <Route
                path="query"
                element={
                  <MetaOnlyRouteGuard>
                    <Query />
                  </MetaOnlyRouteGuard>
                }
              />
              <Route
                path="dashboard"
                element={
                  <MetaOnlyRouteGuard>
                    <Dashboard />
                  </MetaOnlyRouteGuard>
                }
              />
              <Route
                path="dashboard/:id"
                element={
                  <MetaOnlyRouteGuard>
                    <Dashboard />
                  </MetaOnlyRouteGuard>
                }
              />
              <Route
                path="etl"
                element={
                  <MetaOnlyRouteGuard>
                    <ETL />
                  </MetaOnlyRouteGuard>
                }
              />
              <Route index element={<Navigate to={defaultAppPath} replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ToastProvider>
  );
}

export default App;
