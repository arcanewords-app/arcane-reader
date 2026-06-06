import { useTranslation } from 'react-i18next';
import { Select } from '../ui';
import {
  PROJECT_DEFAULT_TARGET_LANGUAGE,
  coerceSourceForTargetChange,
  sourceLanguageOptions,
  targetLanguageOptions,
  type ProjectSourceLanguage,
  type ProjectTargetLanguage,
} from '../../constants/translationLanguages';
import './ProjectLanguagePairFields.css';

interface ProjectLanguagePairFieldsProps {
  sourceLanguage: ProjectSourceLanguage | string;
  onSourceLanguageChange: (value: ProjectSourceLanguage) => void;
  targetLanguage?: string;
  onTargetLanguageChange?: (value: ProjectTargetLanguage) => void;
  targetDisabled?: boolean;
  sourceDisabled?: boolean;
  compact?: boolean;
  /** Prefix for input ids (a11y when multiple instances on page). */
  idPrefix?: string;
}

export function ProjectLanguagePairFields({
  sourceLanguage,
  onSourceLanguageChange,
  targetLanguage = PROJECT_DEFAULT_TARGET_LANGUAGE,
  onTargetLanguageChange,
  targetDisabled = false,
  sourceDisabled = false,
  compact = false,
  idPrefix = 'project',
}: ProjectLanguagePairFieldsProps) {
  const { t } = useTranslation();
  const sourceId = `${idPrefix}-source-language`;
  const targetId = `${idPrefix}-target-language`;
  const resolvedTarget = targetLanguage || PROJECT_DEFAULT_TARGET_LANGUAGE;

  const handleTargetChange = (newTarget: ProjectTargetLanguage) => {
    if (!onTargetLanguageChange) return;
    onTargetLanguageChange(newTarget);
    const coercedSource = coerceSourceForTargetChange(String(sourceLanguage), newTarget);
    if (coercedSource !== sourceLanguage) {
      onSourceLanguageChange(coercedSource);
    }
  };

  return (
    <div
      class={`project-language-pair-fields${compact ? ' project-language-pair-fields--compact' : ''}`}
    >
      <Select
        label={t('project.sourceLanguageLabel')}
        id={sourceId}
        options={sourceLanguageOptions(t, resolvedTarget)}
        value={sourceLanguage}
        disabled={sourceDisabled}
        onChange={(e) =>
          onSourceLanguageChange((e.target as HTMLSelectElement).value as ProjectSourceLanguage)
        }
      />
      <Select
        label={t('project.targetLanguageLabel')}
        id={targetId}
        options={targetLanguageOptions(t)}
        value={resolvedTarget}
        disabled={targetDisabled || !onTargetLanguageChange}
        onChange={
          onTargetLanguageChange
            ? (e) =>
                handleTargetChange((e.target as HTMLSelectElement).value as ProjectTargetLanguage)
            : undefined
        }
      />
      {sourceLanguage === 'ru' && resolvedTarget === 'be' && (
        <p class="project-language-pair-hint">{t('project.ruSourceHint')}</p>
      )}
    </div>
  );
}
