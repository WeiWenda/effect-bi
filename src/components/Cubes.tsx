import { useParams, useNavigate } from 'react-router-dom';
import { CubeListPage } from './cube-explore/CubeListPage';
import { CubeDetailPage } from './Cube';

function Cubes(): React.JSX.Element {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();

  if (name) {
    return <CubeDetailPage cubeName={decodeURIComponent(name)} onBack={() => navigate('/cube')} />;
  }

  return <CubeListPage />;
}

export default Cubes;
