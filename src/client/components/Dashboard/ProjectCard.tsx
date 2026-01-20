import type { ProjectListItem } from '../../types';
import { getProjectTypeIcon, getProjectTypeColor } from '../../utils/project-type';
import './ProjectCard.css';

interface ProjectCardProps {
  project: ProjectListItem;
  onClick: (id: string) => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const projectType = project.type || 'text';
  const typeIcon = getProjectTypeIcon(projectType);
  const typeColor = getProjectTypeColor(projectType);
  const coverImageUrl = project.metadata?.coverImageUrl;
  
  const isOriginalReadingMode = project.originalReadingMode ?? false;
  
  // Progress percentage (only for translation mode)
  const progress = !isOriginalReadingMode && project.chapterCount > 0 
    ? Math.round((project.translatedCount / project.chapterCount) * 100)
    : 0;
  
  // Format date
  const updatedDate = new Date(project.updatedAt);
  const daysAgo = Math.floor((Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
  const dateText = daysAgo === 0 ? 'Сегодня' : daysAgo === 1 ? 'Вчера' : `${daysAgo} дн. назад`;
  
  // Status indicator (only for translation mode)
  const hasErrors = !isOriginalReadingMode && project.chapterCount > 0 && project.translatedCount < project.chapterCount;
  const isComplete = !isOriginalReadingMode && project.chapterCount > 0 && project.translatedCount === project.chapterCount;

  return (
    <div 
      class="project-card"
      onClick={() => onClick(project.id)}
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
                const placeholder = target.parentElement?.querySelector('.project-card-placeholder');
                if (placeholder) {
                  placeholder.classList.remove('hidden');
                }
              }}
              onLoad={(e) => {
                // Hide placeholder when image loads
                const target = e.target as HTMLImageElement;
                const placeholder = target.parentElement?.querySelector('.project-card-placeholder');
                if (placeholder) {
                  placeholder.classList.add('hidden');
                }
              }}
            />
            <div class={`project-card-placeholder ${coverImageUrl ? 'hidden' : ''}`}>
              <span class="project-card-placeholder-icon">{typeIcon}</span>
            </div>
          </>
        ) : (
          <div class="project-card-placeholder">
            <span class="project-card-placeholder-icon">{typeIcon}</span>
          </div>
        )}
        {/* Progress overlay (only for translation mode) */}
        {!isOriginalReadingMode && project.chapterCount > 0 && (
          <div class="project-card-progress-overlay">
            <div 
              class="project-card-progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Card Content */}
      <div class="project-card-content">
        <div class="project-card-title">{project.name}</div>
        <div class="project-card-meta">
          <span class="project-card-progress">
            {isOriginalReadingMode 
              ? `${project.chapterCount} ${project.chapterCount === 1 ? 'глава' : project.chapterCount < 5 ? 'главы' : 'глав'}`
              : `${project.translatedCount}/${project.chapterCount} глав`}
          </span>
          {!isOriginalReadingMode && hasErrors && (
            <span class="project-card-status project-card-status-error" title="Есть непереведенные главы">
              ⚠️
            </span>
          )}
          {!isOriginalReadingMode && isComplete && (
            <span class="project-card-status project-card-status-complete" title="Все главы переведены">
              ✓
            </span>
          )}
        </div>
        <div class="project-card-footer">
          <span class="project-card-date">{dateText}</span>
          {project.glossaryCount > 0 && (
            <span class="project-card-glossary" title="Записей в глоссарии">
              📝 {project.glossaryCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
