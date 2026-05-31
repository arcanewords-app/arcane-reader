import { useTranslation } from 'react-i18next';
import { Select } from '../ui';
import {
  PROJECT_TARGET_LANGUAGE,
  sourceLanguageOptions,
  targetLanguageOptions,
  type ProjectSourceLanguage,
} from '../../constants/translationLanguages';
import './ProjectLanguagePairFields.css';

interface ProjectLanguagePairFieldsProps {
  sourceLanguage: ProjectSourceLanguage | string;
  onSourceLanguageChange: (value: ProjectSourceLanguage) => void;
  targetDisabled?: boolean;
  sourceDisabled?: boolean;
  compact?: boolean;
}

export function ProjectLanguagePairFields({
  sourceLanguage,
  onSourceLanguageChange,
  targetDisabled = true,
  sourceDisabled = false,
  compact = false,
}: ProjectLanguagePairFieldsProps) {
  const { t } = useTranslation();

  return (
    <div
      class={`project-language-pair-fields${compact ? ' project-language-pair-fields--compact' : ''}`}
    >
      <Select
        label={t('project.sourceLanguageLabel')}
        id="project-source-language"
        options={sourceLanguageOptions(t)}
        value={sourceLanguage}
        disabled={sourceDisabled}
        onChange={(e) =>
          onSourceLanguageChange((e.target as HTMLSelectElement).value as ProjectSourceLanguage)
        }
      />
      <Select
        label={t('project.targetLanguageLabel')}
        id="project-target-language"
        options={targetLanguageOptions(t)}
        value={PROJECT_TARGET_LANGUAGE}
        disabled={targetDisabled}
      />
    </div>
  );
}
