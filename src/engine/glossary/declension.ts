/**
 * Russian declension system for proper name handling
 * 
 * Handles declension of names for accurate translation
 * EN → RU translation focus
 */

import type { Declensions, Gender } from '../types/common.js';

/**
 * Declension patterns for Russian language
 */
export type DeclensionPattern = 
  | 'masculine-consonant'    // Джон → Джона, Джону...
  | 'masculine-soft'         // Игорь → Игоря, Игорю...
  | 'masculine-y'            // Дмитрий → Дмитрия...
  | 'feminine-a'             // Анна → Анны, Анне...
  | 'feminine-ya'            // Мария → Марии...
  | 'feminine-soft'          // Любовь → Любови...
  | 'indeclinable';          // Не склоняется (иностранные имена)

/**
 * Determine declension pattern based on name ending and gender
 */
export function detectDeclensionPattern(
  name: string, 
  gender: Gender
): DeclensionPattern {
  const lastChar = name.slice(-1).toLowerCase();
  const lastTwoChars = name.slice(-2).toLowerCase();
  
  // Foreign names ending in vowels (except а, я) are often indeclinable
  if (['о', 'у', 'э', 'и', 'е'].includes(lastChar)) {
    return 'indeclinable';
  }
  
  if (gender === 'female') {
    if (lastChar === 'а') return 'feminine-a';
    if (lastChar === 'я') return 'feminine-ya';
    if (lastChar === 'ь') return 'feminine-soft';
    // Foreign feminine names ending in consonant
    return 'indeclinable';
  }
  
  if (gender === 'male') {
    if (lastTwoChars === 'ий' || lastTwoChars === 'ый') return 'masculine-y';
    if (lastChar === 'ь' || lastChar === 'й') return 'masculine-soft';
    // Most masculine names ending in consonant
    return 'masculine-consonant';
  }
  
  return 'indeclinable';
}

/**
 * Generate all declension forms for a Russian name
 */
export function declineName(
  name: string,
  gender: Gender,
  pattern?: DeclensionPattern
): Declensions {
  const detectedPattern = pattern ?? detectDeclensionPattern(name, gender);
  
  if (detectedPattern === 'indeclinable') {
    return {
      nominative: name,
      genitive: name,
      dative: name,
      accusative: name,
      instrumental: name,
      prepositional: name,
    };
  }
  
  const stem = getStem(name, detectedPattern);
  
  switch (detectedPattern) {
    case 'masculine-consonant':
      return {
        nominative: name,
        genitive: stem + 'а',
        dative: stem + 'у',
        accusative: stem + 'а',
        instrumental: stem + 'ом',
        prepositional: stem + 'е',
      };
      
    case 'masculine-soft':
      return {
        nominative: name,
        genitive: stem + 'я',
        dative: stem + 'ю',
        accusative: stem + 'я',
        instrumental: stem + 'ем',
        prepositional: stem + 'е',
      };
      
    case 'masculine-y':
      return {
        nominative: name,
        genitive: stem + 'ия',
        dative: stem + 'ию',
        accusative: stem + 'ия',
        instrumental: stem + 'ием',
        prepositional: stem + 'ии',
      };
      
    case 'feminine-a':
      return {
        nominative: name,
        genitive: stem + 'ы',
        dative: stem + 'е',
        accusative: stem + 'у',
        instrumental: stem + 'ой',
        prepositional: stem + 'е',
      };
      
    case 'feminine-ya':
      return {
        nominative: name,
        genitive: stem + 'и',
        dative: stem + 'е',
        accusative: stem + 'ю',
        instrumental: stem + 'ей',
        prepositional: stem + 'е',
      };
      
    case 'feminine-soft':
      return {
        nominative: name,
        genitive: stem + 'и',
        dative: stem + 'и',
        accusative: stem,
        instrumental: stem + 'ью',
        prepositional: stem + 'и',
      };
      
    default:
      return {
        nominative: name,
        genitive: name,
        dative: name,
        accusative: name,
        instrumental: name,
        prepositional: name,
      };
  }
}

/**
 * Get the stem of a name based on its declension pattern
 */
function getStem(name: string, pattern: DeclensionPattern): string {
  switch (pattern) {
    case 'feminine-a':
    case 'feminine-ya':
      return name.slice(0, -1);
    case 'masculine-soft':
      return name.slice(0, -1);
    case 'masculine-y':
      return name.slice(0, -2);
    case 'feminine-soft':
      return name.slice(0, -1);
    default:
      return name;
  }
}

/**
 * Transliterate English name to Russian
 */
export function transliterateToRussian(englishName: string): string {
  const map: Record<string, string> = {
    'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е',
    'f': 'ф', 'g': 'г', 'h': 'х', 'i': 'и', 'j': 'дж',
    'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о',
    'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т',
    'u': 'у', 'v': 'в', 'w': 'в', 'x': 'кс', 'y': 'й',
    'z': 'з',
    // Common digraphs
    'sh': 'ш', 'ch': 'ч', 'th': 'т', 'ph': 'ф',
    'ck': 'к', 'gh': 'г', 'wh': 'в',
  };
  
  let result = '';
  let i = 0;
  const lower = englishName.toLowerCase();
  
  while (i < englishName.length) {
    // Check for digraphs first
    const twoChar = lower.slice(i, i + 2);
    if (map[twoChar]) {
      const isUpper = englishName[i] === englishName[i].toUpperCase();
      result += isUpper 
        ? map[twoChar].charAt(0).toUpperCase() + map[twoChar].slice(1)
        : map[twoChar];
      i += 2;
      continue;
    }
    
    // Single character
    const char = lower[i];
    if (map[char]) {
      const isUpper = englishName[i] === englishName[i].toUpperCase();
      result += isUpper ? map[char].toUpperCase() : map[char];
    } else {
      result += englishName[i];
    }
    i++;
  }
  
  return result;
}

/**
 * Common English names with established Russian translations
 */
export const COMMON_NAME_TRANSLATIONS: Record<string, { ru: string; gender: Gender }> = {
  'John': { ru: 'Джон', gender: 'male' },
  'James': { ru: 'Джеймс', gender: 'male' },
  'Michael': { ru: 'Майкл', gender: 'male' },
  'William': { ru: 'Уильям', gender: 'male' },
  'David': { ru: 'Дэвид', gender: 'male' },
  'Richard': { ru: 'Ричард', gender: 'male' },
  'Robert': { ru: 'Роберт', gender: 'male' },
  'Charles': { ru: 'Чарльз', gender: 'male' },
  'Thomas': { ru: 'Томас', gender: 'male' },
  'Daniel': { ru: 'Дэниел', gender: 'male' },
  'Matthew': { ru: 'Мэтью', gender: 'male' },
  'Anthony': { ru: 'Энтони', gender: 'male' },
  'Mark': { ru: 'Марк', gender: 'male' },
  'Steven': { ru: 'Стивен', gender: 'male' },
  'Paul': { ru: 'Пол', gender: 'male' },
  'Andrew': { ru: 'Эндрю', gender: 'male' },
  'Joshua': { ru: 'Джошуа', gender: 'male' },
  'Kenneth': { ru: 'Кеннет', gender: 'male' },
  'Kevin': { ru: 'Кевин', gender: 'male' },
  'Brian': { ru: 'Брайан', gender: 'male' },
  'George': { ru: 'Джордж', gender: 'male' },
  'Timothy': { ru: 'Тимоти', gender: 'male' },
  'Ronald': { ru: 'Рональд', gender: 'male' },
  'Edward': { ru: 'Эдвард', gender: 'male' },
  'Jason': { ru: 'Джейсон', gender: 'male' },
  'Jeffrey': { ru: 'Джеффри', gender: 'male' },
  'Ryan': { ru: 'Райан', gender: 'male' },
  'Jacob': { ru: 'Джейкоб', gender: 'male' },
  'Gary': { ru: 'Гэри', gender: 'male' },
  'Nicholas': { ru: 'Николас', gender: 'male' },
  'Eric': { ru: 'Эрик', gender: 'male' },
  'Jonathan': { ru: 'Джонатан', gender: 'male' },
  'Stephen': { ru: 'Стивен', gender: 'male' },
  'Larry': { ru: 'Ларри', gender: 'male' },
  'Justin': { ru: 'Джастин', gender: 'male' },
  'Scott': { ru: 'Скотт', gender: 'male' },
  'Brandon': { ru: 'Брэндон', gender: 'male' },
  'Benjamin': { ru: 'Бенджамин', gender: 'male' },
  'Samuel': { ru: 'Сэмюэл', gender: 'male' },
  'Raymond': { ru: 'Рэймонд', gender: 'male' },
  'Gregory': { ru: 'Грегори', gender: 'male' },
  'Frank': { ru: 'Фрэнк', gender: 'male' },
  'Alexander': { ru: 'Александр', gender: 'male' },
  'Patrick': { ru: 'Патрик', gender: 'male' },
  'Jack': { ru: 'Джек', gender: 'male' },
  'Henry': { ru: 'Генри', gender: 'male' },
  'Peter': { ru: 'Питер', gender: 'male' },
  'Arthur': { ru: 'Артур', gender: 'male' },
  'Harry': { ru: 'Гарри', gender: 'male' },
  
  // Female names
  'Mary': { ru: 'Мэри', gender: 'female' },
  'Patricia': { ru: 'Патриция', gender: 'female' },
  'Jennifer': { ru: 'Дженнифер', gender: 'female' },
  'Linda': { ru: 'Линда', gender: 'female' },
  'Barbara': { ru: 'Барбара', gender: 'female' },
  'Elizabeth': { ru: 'Элизабет', gender: 'female' },
  'Susan': { ru: 'Сьюзан', gender: 'female' },
  'Jessica': { ru: 'Джессика', gender: 'female' },
  'Sarah': { ru: 'Сара', gender: 'female' },
  'Karen': { ru: 'Карен', gender: 'female' },
  'Lisa': { ru: 'Лиза', gender: 'female' },
  'Nancy': { ru: 'Нэнси', gender: 'female' },
  'Betty': { ru: 'Бетти', gender: 'female' },
  'Margaret': { ru: 'Маргарет', gender: 'female' },
  'Sandra': { ru: 'Сандра', gender: 'female' },
  'Ashley': { ru: 'Эшли', gender: 'female' },
  'Kimberly': { ru: 'Кимберли', gender: 'female' },
  'Emily': { ru: 'Эмили', gender: 'female' },
  'Donna': { ru: 'Донна', gender: 'female' },
  'Michelle': { ru: 'Мишель', gender: 'female' },
  'Dorothy': { ru: 'Дороти', gender: 'female' },
  'Carol': { ru: 'Кэрол', gender: 'female' },
  'Amanda': { ru: 'Аманда', gender: 'female' },
  'Melissa': { ru: 'Мелисса', gender: 'female' },
  'Deborah': { ru: 'Дебора', gender: 'female' },
  'Stephanie': { ru: 'Стефани', gender: 'female' },
  'Rebecca': { ru: 'Ребекка', gender: 'female' },
  'Sharon': { ru: 'Шэрон', gender: 'female' },
  'Laura': { ru: 'Лора', gender: 'female' },
  'Cynthia': { ru: 'Синтия', gender: 'female' },
  'Kathleen': { ru: 'Кэтлин', gender: 'female' },
  'Amy': { ru: 'Эми', gender: 'female' },
  'Angela': { ru: 'Анджела', gender: 'female' },
  'Shirley': { ru: 'Ширли', gender: 'female' },
  'Anna': { ru: 'Анна', gender: 'female' },
  'Brenda': { ru: 'Бренда', gender: 'female' },
  'Pamela': { ru: 'Памела', gender: 'female' },
  'Emma': { ru: 'Эмма', gender: 'female' },
  'Nicole': { ru: 'Николь', gender: 'female' },
  'Helen': { ru: 'Хелен', gender: 'female' },
  'Samantha': { ru: 'Саманта', gender: 'female' },
  'Katherine': { ru: 'Кэтрин', gender: 'female' },
  'Christine': { ru: 'Кристин', gender: 'female' },
  'Victoria': { ru: 'Виктория', gender: 'female' },
  'Alice': { ru: 'Элис', gender: 'female' },
  'Julia': { ru: 'Джулия', gender: 'female' },
  'Grace': { ru: 'Грейс', gender: 'female' },
  'Rose': { ru: 'Роуз', gender: 'female' },
  'Sophie': { ru: 'Софи', gender: 'female' },
};

/**
 * Get Russian translation and declensions for an English name
 */
export function translateName(
  englishName: string,
  gender: Gender
): { translatedName: string; declensions: Declensions } {
  // Check common translations first
  const common = COMMON_NAME_TRANSLATIONS[englishName];
  if (common) {
    return {
      translatedName: common.ru,
      declensions: declineName(common.ru, common.gender),
    };
  }
  
  // Transliterate and decline
  const transliterated = transliterateToRussian(englishName);
  return {
    translatedName: transliterated,
    declensions: declineName(transliterated, gender),
  };
}

