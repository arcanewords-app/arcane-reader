import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import type { Project } from '../types';
import { getProject } from '../store/projects';
import { ReadingMode } from '../components/ReadingMode';

interface ReadingModePageProps {
  projectId: string;
  chapterId?: string;
}

export function ReadingModePage({ projectId, chapterId }: ReadingModePageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const loadedProject = await getProject(projectId, false);
      if (loadedProject) {
        setProject(loadedProject);
      } else {
        route('/');
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      route('/');
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => {
    if (chapterId) {
      route(`/projects/${projectId}/chapters/${chapterId}`);
    } else {
      route(`/projects/${projectId}`);
    }
  };

  if (loading || !project) {
    return <div>Загрузка...</div>;
  }

  return (
    <ReadingMode
      project={project}
      initialChapterId={chapterId}
      onExit={handleExit}
    />
  );
}
