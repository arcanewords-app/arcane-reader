import type { PublicEntity } from '../../types';
import './TagChip.css';

interface TagChipProps {
  entity: PublicEntity;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  /** When true, shows remove affordance (e.g. in selected tags list). */
  removable?: boolean;
  className?: string;
}

export function TagChip({
  entity,
  selected = false,
  onClick,
  onRemove,
  removable = false,
  className = '',
}: TagChipProps) {
  const isInteractive = Boolean(onClick) || removable;

  return (
    <span
      class={`tag-chip ${selected ? 'tag-chip--selected' : ''} ${isInteractive ? 'tag-chip--interactive' : ''} ${className}`.trim()}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (removable && onRemove && (e.key === 'Backspace' || e.key === 'Delete')) {
          e.preventDefault();
          onRemove();
        }
      }}
    >
      <span class="tag-chip__label">{entity.name}</span>
      {removable && onRemove && (
        <button
          type="button"
          class="tag-chip__remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${entity.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
