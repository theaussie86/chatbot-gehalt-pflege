
import { getProjects } from '@/app/actions/projects';
import ProjectList from '@/components/project-list';

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="container mx-auto px-4 py-8">
      <ProjectList projects={projects} />
    </div>
  );
}
