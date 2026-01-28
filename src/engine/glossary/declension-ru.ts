/**
 * Russian declension system using Petrovich library
 * 
 * Petrovich - библиотека для склонения русских ФИО
 * https://github.com/petrovich/petrovich-js
 */

// @ts-ignore - petrovich doesn't have types
import petrovich from 'petrovich';
import type { Declensions, Gender } from '../types/common.js';

type PetrovichGender = 'male' | 'female' | 'androgynous';
type PetrovichCase = 'nominative' | 'genitive' | 'dative' | 'accusative' | 'instrumental' | 'prepositional';

/**
 * Convert our gender type to petrovich format
 */
function toPetrovichGender(gender: Gender): PetrovichGender {
  if (gender === 'male') return 'male';
  if (gender === 'female') return 'female';
  return 'androgynous';
}

/**
 * Decline a Russian name using Petrovich
 */
export function declineNameRu(
  firstName: string,
  gender: Gender,
  lastName?: string
): Declensions {
  const petrovichGender = toPetrovichGender(gender);
  
  const person = {
    gender: petrovichGender,
    first: firstName,
    last: lastName || '',
  };
  
  const cases: PetrovichCase[] = [
    'nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'prepositional'
  ];
  
  const result: Declensions = {
    nominative: '',
    genitive: '',
    dative: '',
    accusative: '',
    instrumental: '',
    prepositional: '',
  };
  
  for (const case_ of cases) {
    try {
      const declined = petrovich(person, case_);
      // Combine first and last name if both present
      result[case_] = lastName 
        ? `${declined.first} ${declined.last}`.trim()
        : declined.first;
    } catch {
      // If declension fails, use original
      result[case_] = lastName ? `${firstName} ${lastName}` : firstName;
    }
  }
  
  return result;
}

/**
 * Decline just a first name (most common case for translated names)
 */
export function declineFirstName(name: string, gender: Gender): Declensions {
  return declineNameRu(name, gender);
}

/**
 * Try to detect gender from a Russian name ending
 */
export function detectGenderFromRussianName(name: string): Gender {
  const lastChar = name.slice(-1).toLowerCase();
  const lastTwoChars = name.slice(-2).toLowerCase();
  
  // Common feminine endings
  if (['а', 'я'].includes(lastChar) && !['ия', 'ья'].includes(lastTwoChars)) {
    return 'female';
  }
  
  // Soft sign can be both
  if (lastChar === 'ь') {
    // Common feminine names ending in ь
    const femininePatterns = ['овь', 'ель', 'аль'];
    if (femininePatterns.some(p => name.toLowerCase().endsWith(p))) {
      return 'female';
    }
    return 'male'; // Default for -ь is male (Игорь, etc.)
  }
  
  // Most consonant endings are masculine
  return 'male';
}

/**
 * Common English to Russian name translations
 * Using standard transliteration conventions
 */
export const EN_RU_NAMES: Record<string, { ru: string; gender: Gender }> = {
  // Male names
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
  'Edward': { ru: 'Эдвард', gender: 'male' },
  'Jason': { ru: 'Джейсон', gender: 'male' },
  'Ryan': { ru: 'Райан', gender: 'male' },
  'Jacob': { ru: 'Джейкоб', gender: 'male' },
  'Nicholas': { ru: 'Николас', gender: 'male' },
  'Eric': { ru: 'Эрик', gender: 'male' },
  'Jonathan': { ru: 'Джонатан', gender: 'male' },
  'Stephen': { ru: 'Стивен', gender: 'male' },
  'Justin': { ru: 'Джастин', gender: 'male' },
  'Scott': { ru: 'Скотт', gender: 'male' },
  'Brandon': { ru: 'Брэндон', gender: 'male' },
  'Benjamin': { ru: 'Бенджамин', gender: 'male' },
  'Samuel': { ru: 'Сэмюэл', gender: 'male' },
  'Alexander': { ru: 'Александр', gender: 'male' },
  'Patrick': { ru: 'Патрик', gender: 'male' },
  'Jack': { ru: 'Джек', gender: 'male' },
  'Henry': { ru: 'Генри', gender: 'male' },
  'Peter': { ru: 'Питер', gender: 'male' },
  'Arthur': { ru: 'Артур', gender: 'male' },
  'Harry': { ru: 'Гарри', gender: 'male' },
  'Luke': { ru: 'Люк', gender: 'male' },
  'Oliver': { ru: 'Оливер', gender: 'male' },
  'Max': { ru: 'Макс', gender: 'male' },
  'Ethan': { ru: 'Итан', gender: 'male' },
  'Noah': { ru: 'Ной', gender: 'male' },
  'Liam': { ru: 'Лиам', gender: 'male' },
  
  // Female names
  'Mary': { ru: 'Мэри', gender: 'female' },
  'Patricia': { ru: 'Патриция', gender: 'female' },
  'Jennifer': { ru: 'Дженнифер', gender: 'female' },
  'Linda': { ru: 'Линда', gender: 'female' },
  'Elizabeth': { ru: 'Элизабет', gender: 'female' },
  'Barbara': { ru: 'Барбара', gender: 'female' },
  'Susan': { ru: 'Сьюзан', gender: 'female' },
  'Jessica': { ru: 'Джессика', gender: 'female' },
  'Sarah': { ru: 'Сара', gender: 'female' },
  'Karen': { ru: 'Карен', gender: 'female' },
  'Lisa': { ru: 'Лиза', gender: 'female' },
  'Nancy': { ru: 'Нэнси', gender: 'female' },
  'Margaret': { ru: 'Маргарет', gender: 'female' },
  'Sandra': { ru: 'Сандра', gender: 'female' },
  'Ashley': { ru: 'Эшли', gender: 'female' },
  'Emily': { ru: 'Эмили', gender: 'female' },
  'Michelle': { ru: 'Мишель', gender: 'female' },
  'Amanda': { ru: 'Аманда', gender: 'female' },
  'Melissa': { ru: 'Мелисса', gender: 'female' },
  'Rebecca': { ru: 'Ребекка', gender: 'female' },
  'Laura': { ru: 'Лора', gender: 'female' },
  'Stephanie': { ru: 'Стефани', gender: 'female' },
  'Sharon': { ru: 'Шэрон', gender: 'female' },
  'Cynthia': { ru: 'Синтия', gender: 'female' },
  'Amy': { ru: 'Эми', gender: 'female' },
  'Angela': { ru: 'Анджела', gender: 'female' },
  'Anna': { ru: 'Анна', gender: 'female' },
  'Emma': { ru: 'Эмма', gender: 'female' },
  'Nicole': { ru: 'Николь', gender: 'female' },
  'Helen': { ru: 'Хелен', gender: 'female' },
  'Samantha': { ru: 'Саманта', gender: 'female' },
  'Katherine': { ru: 'Кэтрин', gender: 'female' },
  'Victoria': { ru: 'Виктория', gender: 'female' },
  'Alice': { ru: 'Элис', gender: 'female' },
  'Julia': { ru: 'Джулия', gender: 'female' },
  'Grace': { ru: 'Грейс', gender: 'female' },
  'Rose': { ru: 'Роуз', gender: 'female' },
  'Sophie': { ru: 'Софи', gender: 'female' },
  'Olivia': { ru: 'Оливия', gender: 'female' },
  'Ava': { ru: 'Ава', gender: 'female' },
  'Isabella': { ru: 'Изабелла', gender: 'female' },
  'Mia': { ru: 'Мия', gender: 'female' },
  'Charlotte': { ru: 'Шарлотта', gender: 'female' },
};

/**
 * Transliterate English name to Russian
 */
export function transliterateEnToRu(englishName: string): string {
  // Check known names first
  if (EN_RU_NAMES[englishName]) {
    return EN_RU_NAMES[englishName].ru;
  }
  
  const map: Record<string, string> = {
    'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е',
    'f': 'ф', 'g': 'г', 'h': 'х', 'i': 'и', 'j': 'дж',
    'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о',
    'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т',
    'u': 'у', 'v': 'в', 'w': 'в', 'x': 'кс', 'y': 'й',
    'z': 'з',
  };
  
  const digraphs: Record<string, string> = {
    'sh': 'ш', 'ch': 'ч', 'th': 'т', 'ph': 'ф',
    'ck': 'к', 'gh': 'г', 'wh': 'в', 'oo': 'у',
    'ee': 'и', 'ea': 'и', 'ou': 'ау', 'ow': 'оу',
  };
  
  let result = '';
  let i = 0;
  const lower = englishName.toLowerCase();
  
  while (i < englishName.length) {
    // Check for digraphs first
    const twoChar = lower.slice(i, i + 2);
    if (digraphs[twoChar]) {
      const isUpper = englishName[i] === englishName[i].toUpperCase();
      const transliterated = digraphs[twoChar];
      result += isUpper 
        ? transliterated.charAt(0).toUpperCase() + transliterated.slice(1)
        : transliterated;
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
 * Translate and decline an English name to Russian with all cases
 */
export function translateAndDeclineName(
  englishName: string,
  gender?: Gender
): { translatedName: string; declensions: Declensions; gender: Gender } {
  // Check known translations
  const known = EN_RU_NAMES[englishName];
  
  let translatedName: string;
  let detectedGender: Gender;
  
  if (known) {
    translatedName = known.ru;
    detectedGender = gender || known.gender;
  } else {
    translatedName = transliterateEnToRu(englishName);
    detectedGender = gender || detectGenderFromRussianName(translatedName);
  }
  
  const declensions = declineFirstName(translatedName, detectedGender);
  
  return {
    translatedName,
    declensions,
    gender: detectedGender,
  };
}

