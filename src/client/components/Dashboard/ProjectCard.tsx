import { useTranslation } from 'react-i18next';
import type { ProjectListItem } from '../../types';
import { getProjectTypeColor } from '../../utils/project-type';
import { trackEvent } from '../../utils/analytics';
import { BookPlaceholder } from './BookPlaceholder';
import { Icon } from '../ui';
import './ProjectCard.css';

interface ProjectCardProps {
  project: ProjectListItem;
  onClick: (id: string) => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const { t } = useTranslation();
  const projectType = project.type || 'text';
  const typeColor = getProjectTypeColor(projectType);
  const coverImageUrl = project.metadata?.coverImageUrl;

  const isOriginalReadingMode = project.originalReadingMode ?? false;

  // Progress percentage (only for translation mode)
  const progress =
    !isOriginalReadingMode && project.chapterCount > 0
      ? Math.round((project.translatedCount / project.chapterCount) * 100)
      : 0;

  // Format date
  const updatedDate = new Date(project.updatedAt);
  const daysAgo = Math.floor((Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
  const dateText =
    daysAgo === 0
      ? t('projectCard.today')
      : daysAgo === 1
        ? t('projectCard.yesterday')
        : t('projectCard.daysAgo', { count: daysAgo });

  // Status indicator (only for translation mode)
  const hasErrors =
    !isOriginalReadingMode &&
    project.chapterCount > 0 &&
    project.translatedCount < project.chapterCount;
  const isComplete =
    !isOriginalReadingMode &&
    project.chapterCount > 0 &&
    project.translatedCount === project.chapterCount;

  return (
    <div
      class="project-card"
      role="button"
      tabIndex={0}
      onClick={() => onClick(project.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trackEvent('select_content', {
            content_type: 'project',
            item_id: project.id,
          });
          onClick(project.id);
        }
      }}
      style={{
        borderLeftColor: typeColor,
      }}
    >
      {/* Cover Image or Placeholder */}
      <div class="project-card-cover">
        {coverImageUrl ? (
          <>
            <img
              src={coverImageUrl}
              alt={project.name}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // Fallback to placeholder on error
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const placeholder = target.parentElement?.querySelector(
                  '.project-card-placeholder'
                );
                if (placeholder) {
                  placeholder.classList.remove('hidden');
                }
              }}
              onLoad={(e) => {
                // Hide placeholder when image loads
                const target = e.target as HTMLImageElement;
                const placeholder = target.parentElement?.querySelector(
                  '.project-card-placeholder'
                );
                if (placeholder) {
                  placeholder.classList.add('hidden');
                }
              }}
            />
            <div class={`project-card-placeholder ${coverImageUrl ? 'hidden' : ''}`}>
              <BookPlaceholder
                projectName={project.name}
                projectType={projectType as 'book' | 'text'}
              />
            </div>
          </>
        ) : (
          <div class="project-card-placeholder">
            <BookPlaceholder
              projectName={project.name}
              projectType={projectType as 'book' | 'text'}
            />
          </div>
        )}
        {/* Progress overlay (only for translation mode) */}
        {!isOriginalReadingMode && project.chapterCount > 0 && (
          <div class="project-card-progress-overlay">
            <div class="project-card-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Card Content */}
      <div class="project-card-content">
        <div class="project-card-title">{project.name}</div>
        <div class="project-card-meta">
          <span class="project-card-progress">
            {isOriginalReadingMode
              ? `${project.chapterCount} ${project.chapterCount === 1 ? t('project.chapterOne') : project.chapterCount < 5 ? t('project.chapterFew') : t('project.chapterMany')}`
              : t('projectCard.chaptersProgress', {
                  translated: project.translatedCount,
                  total: project.chapterCount,
                })}
          </span>
          {!isOriginalReadingMode && hasErrors && (
            <span
              class="project-card-status project-card-status-error"
              title={t('projectCard.hasUntranslatedChapters')}
            >
              <Icon name="warning" size="sm" />
            </span>
          )}
          {!isOriginalReadingMode && isComplete && (
            <span
              class="project-card-status project-card-status-complete"
              title={t('projectCard.allChaptersTranslated')}
            >
              <Icon name="check" size="sm" />
            </span>
          )}
        </div>
        <div class="project-card-footer">
          <span class="project-card-date">{dateText}</span>
          {project.glossaryCount > 0 && (
            <span class="project-card-glossary" title={t('projectCard.glossaryEntriesTitle')}>
              <Icon name="menu_book" size="sm" /> {project.glossaryCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
