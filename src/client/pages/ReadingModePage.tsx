import { useEffect, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import type { ProjectWithChapterList } from '../types';
import { getProject } from '../store/projects';
import { ReadingMode } from '../components/ReadingMode';
import { PageLoading } from '../components/ui';
import { getFirstAuthorReadingChapterId } from '../utils/readingRoutes';

interface ReadingModePageProps {
  projectId: string;
  chapterId?: string;
}

export function ReadingModePage({ projectId, chapterId }: ReadingModePageProps) {
  const { t } = useTranslation();
  const [project, setProject] = useState<ProjectWithChapterList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProject is stable
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const loadedProject = await getProject(projectId);
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

  useEffect(() => {
    if (!project || chapterId) return;
    const firstId = getFirstAuthorReadingChapterId(project);
    if (firstId) {
      route(`/projects/${projectId}/chapters/${firstId}/reading`, true);
    }
  }, [project, chapterId, projectId]);

  const handleExit = (currentChapterId?: string) => {
    if (currentChapterId) {
      route(`/projects/${projectId}/chapters/${currentChapterId}`);
    } else {
      route(`/projects/${projectId}`);
    }
  };

  if (loading || !project) {
    return <PageLoading text={t('common.loading')} />;
  }

  return <ReadingMode project={project} initialChapterId={chapterId} onExit={handleExit} />;
}
