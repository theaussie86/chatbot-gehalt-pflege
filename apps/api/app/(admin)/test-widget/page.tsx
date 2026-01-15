
import { getProjects } from '@/app/actions/projects';
import TestWidgetView from '@/components/test-widget-view';

export default async function TestWidgetPage() {
  const projects = await getProjects();

  return (
    <div className="container mx-auto px-4 py-8">
      <TestWidgetView projects={projects} />
    </div>
  );
}
