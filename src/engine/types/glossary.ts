/**
 * Glossary types for maintaining translation consistency
 */

import type { Declensions, Gender } from './common.js';

export interface Character {
  id: string;
  originalName: string;
  translatedName: string;
  declensions: Declensions;
  gender: Gender;
  description: string;
  aliases: string[];
  firstAppearance: number; // Chapter number
  isMainCharacter: boolean;
}

export interface Location {
  id: string;
  originalName: string;
  translatedName: string;
  description: string;
  type: 'city' | 'country' | 'building' | 'region' | 'world' | 'other';
}

export interface Term {
  id: string;
  originalTerm: string;
  translatedTerm: string;
  category: 'skill' | 'magic' | 'item' | 'title' | 'organization' | 'race' | 'other';
  description: string;
  context?: string;
}

export interface Glossary {
  novelId: string;
  version: number;
  lastUpdated: Date;
  characters: Character[];
  locations: Location[];
  terms: Term[];
}

export interface GlossaryUpdate {
  newCharacters: Omit<Character, 'id'>[];
  newLocations: Omit<Location, 'id'>[];
  newTerms: Omit<Term, 'id'>[];
  updatedCharacters: Partial<Character>[];
  updatedLocations: Partial<Location>[];
  updatedTerms: Partial<Term>[];
}

