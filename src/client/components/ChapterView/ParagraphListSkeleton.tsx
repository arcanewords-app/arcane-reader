import { Skeleton } from '../ui';
import './ParagraphList.css';
import './ParagraphListSkeleton.css';

/** Width percentages for paragraph-like skeleton lines (varied lengths) */
const SKELETON_WIDTHS = [98, 85, 72, 95, 60, 88, 75, 90, 65, 82, 78];

export function ParagraphListSkeleton() {
  return (
    <div class="text-panel-unified">
      <div class="panel-headers">
        <div class="panel-header-left">
          <Skeleton variant="text" width="10rem" height="1.25rem" />
          <Skeleton
            variant="text"
            width="4rem"
            height="0.875rem"
            class="paragraph-list-skeleton__stats"
          />
        </div>
        <div class="panel-header-right">
          <Skeleton variant="text" width="10rem" height="1.25rem" />
          <Skeleton
            variant="text"
            width="4rem"
            height="0.875rem"
            class="paragraph-list-skeleton__stats"
          />
        </div>
      </div>

      <div class="paragraphs-unified paragraph-list-skeleton__content">
        {SKELETON_WIDTHS.map((width, i) => (
          <div key={i} class="paragraph-row paragraph-list-skeleton__row">
            <div class="paragraph-cell paragraph-cell-original">
              <Skeleton variant="text" width={`${width}%`} height="1.125rem" />
            </div>
            <div class="paragraph-cell paragraph-cell-translation">
              <Skeleton variant="text" width={`${Math.min(100, width + 5)}%`} height="1.125rem" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
