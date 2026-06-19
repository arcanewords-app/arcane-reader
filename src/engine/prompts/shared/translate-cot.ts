/**
 * Chain-of-thought (analysis field) JSON format for Stage 2 translate.
 */

export const TRANSLATE_COT_JSON_FORMAT_APPENDIX = `
**When chain-of-thought is enabled**, fill the \`analysis\` object **first**, then \`paragraphs\`:

{
  "analysis": {
    "glossaryTermsInChunk": [
      { "original": "Shadow Step", "useForm": "Теневой шаг", "gender": "" }
    ],
    "genderPlan": [
      { "character": "Elara", "gender": "female", "verbExamples": "вздохнула, сказала" }
    ],
    "notes": "Ambiguous pronoun refers to Elara [f]"
  },
  "paragraphs": [
    { "id": "--para:abc123--", "translated": "..." }
  ]
}

Rules for \`analysis\`:
- List glossary terms that appear in this chunk and the exact target form to use
- Plan gender for characters before writing \`paragraphs\`
- \`analysis\` is for planning only; the readable translation lives in \`paragraphs\`
`;

/** OpenAI Structured Outputs schema (strict). Field order: analysis before paragraphs. */
export const TRANSLATE_COT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'object',
      properties: {
        glossaryTermsInChunk: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              original: { type: 'string' },
              useForm: { type: 'string' },
              gender: { type: 'string' },
            },
            required: ['original', 'useForm', 'gender'],
            additionalProperties: false,
          },
        },
        genderPlan: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              character: { type: 'string' },
              gender: { type: 'string' },
              verbExamples: { type: 'string' },
            },
            required: ['character', 'gender', 'verbExamples'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['glossaryTermsInChunk', 'genderPlan', 'notes'],
      additionalProperties: false,
    },
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          translated: { type: 'string' },
        },
        required: ['id', 'translated'],
        additionalProperties: false,
      },
    },
  },
  required: ['analysis', 'paragraphs'],
  additionalProperties: false,
} as const;

export interface TranslateCoTAnalysis {
  glossaryTermsInChunk?: Array<{ original: string; useForm: string; gender?: string }>;
  genderPlan?: Array<{ character: string; gender: string; verbExamples?: string }>;
  notes?: string;
}

export interface TranslateCoTResponse {
  analysis?: TranslateCoTAnalysis;
  paragraphs: Array<{ id: string; translated: string }>;
}
