import { EtlWorkspace } from './etl-explore/EtlWorkspace';

export function ETL(): React.JSX.Element {
  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50">
      <EtlWorkspace />
    </div>
  );
}
