import { useTranslation } from 'react-i18next';
import type { EvaluationIssue } from '../../types';
import './CriticIssueList.css';

interface CriticIssueListProps {
  issues: EvaluationIssue[];
}

export function CriticIssueList({ issues }: CriticIssueListProps) {
  const { t } = useTranslation();

  if (!issues.length) {
    return <p class="critic-issue-empty">{t('critic.noIssues')}</p>;
  }

  return (
    <ul class="critic-issue-list">
      {issues.map((issue, i) => (
        <li
          key={`${issue.paragraphIndex}-${issue.severity}-${i}`}
          class={`critic-issue-item critic-severity--${issue.severity.toLowerCase()}`}
        >
          <span
            class={`critic-severity-badge critic-severity-badge--${issue.severity.toLowerCase()}`}
          >
            {t(`critic.severity.${issue.severity}`)}
          </span>
          <span class="critic-issue-dimension">{t(`critic.dimension.${issue.dimension}`)}</span>
          <span class="critic-issue-description">{issue.description}</span>
        </li>
      ))}
    </ul>
  );
}
