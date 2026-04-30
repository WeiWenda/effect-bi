import { useParams, useNavigate } from 'react-router-dom';
import { DashboardListPage } from './dashboard-explore/DashboardListPage';
import { DashboardDetailPage } from './dashboard-explore/DashboardDetailPage';

function Dashboard(): React.JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  if (id) {
    return <DashboardDetailPage dashboardId={parseInt(id)} onBack={() => navigate('/dashboard')} />;
  }

  return <DashboardListPage />;
}

export default Dashboard;
