/**
 * Glossary Manager - Manages translation glossary with consistency
 */

import type { Glossary, Character, Location, Term, GlossaryUpdate } from '../types/glossary.js';
import type { Gender, Declensions } from '../types/common.js';
import { declineName, translateName, COMMON_NAME_TRANSLATIONS } from './declension.js';

export class GlossaryManager {
  private glossary: Glossary;
  
  constructor(glossary: Glossary) {
    this.glossary = glossary;
  }
  
  /**
   * Create empty glossary for a novel
   */
  static createEmpty(novelId: string): GlossaryManager {
    return new GlossaryManager({
      novelId,
      version: 1,
      lastUpdated: new Date(),
      characters: [],
      locations: [],
      terms: [],
    });
  }
  
  /**
   * Load glossary from JSON
   */
  static fromJSON(json: string): GlossaryManager {
    const data = JSON.parse(json) as Glossary;
    data.lastUpdated = new Date(data.lastUpdated);
    return new GlossaryManager(data);
  }
  
  /**
   * Export glossary to JSON
   */
  toJSON(): string {
    return JSON.stringify(this.glossary, null, 2);
  }
  
  /**
   * Get the raw glossary data
   */
  getData(): Glossary {
    return this.glossary;
  }
  
  // ============ Character Management ============
  
  /**
   * Add a new character to glossary
   */
  addCharacter(params: {
    originalName: string;
    translatedName?: string;
    gender: Gender;
    description?: string;
    aliases?: string[];
    chapterNumber?: number;
    isMainCharacter?: boolean;
  }): Character {
    // Check if character already exists
    const existing = this.findCharacter(params.originalName);
    if (existing) {
      return existing;
    }
    
    // Get translation and declensions
    let translatedName = params.translatedName;
    let declensions: Declensions;
    
    if (translatedName) {
      declensions = declineName(translatedName, params.gender);
    } else {
      const result = translateName(params.originalName, params.gender);
      translatedName = result.translatedName;
      declensions = result.declensions;
    }
    
    const character: Character = {
      id: this.generateId('char'),
      originalName: params.originalName,
      translatedName,
      declensions,
      gender: params.gender,
      description: params.description ?? '',
      aliases: params.aliases ?? [],
      firstAppearance: params.chapterNumber ?? 1,
      isMainCharacter: params.isMainCharacter ?? false,
    };
    
    this.glossary.characters.push(character);
    this.touch();
    
    return character;
  }
  
  /**
   * Update character
   */
  updateCharacter(id: string, updates: Partial<Omit<Character, 'id'>>): Character | undefined {
    const char = this.glossary.characters.find(c => c.id === id);
    if (!char) return undefined;
    
    // If name changed, recalculate declensions
    if (updates.translatedName && updates.translatedName !== char.translatedName) {
      updates.declensions = declineName(
        updates.translatedName,
        updates.gender ?? char.gender
      );
    }
    
    Object.assign(char, updates);
    this.touch();
    
    return char;
  }
  
  /**
   * Find character by original name or alias
   */
  findCharacter(name: string): Character | undefined {
    return this.glossary.characters.find(
      c => c.originalName.toLowerCase() === name.toLowerCase() ||
           c.aliases.some(a => a.toLowerCase() === name.toLowerCase())
    );
  }
  
  /**
   * Get character's translated name in specific case
   */
  getCharacterInCase(
    originalName: string, 
    case_: keyof Declensions
  ): string | undefined {
    const char = this.findCharacter(originalName);
    if (!char) return undefined;
    return char.declensions[case_];
  }
  
  /**
   * Add alias to character
   */
  addCharacterAlias(characterId: string, alias: string): void {
    const char = this.glossary.characters.find(c => c.id === characterId);
    if (char && !char.aliases.includes(alias)) {
      char.aliases.push(alias);
      this.touch();
    }
  }
  
  // ============ Location Management ============
  
  /**
   * Add a new location
   */
  addLocation(params: {
    originalName: string;
    translatedName: string;
    type: Location['type'];
    description?: string;
  }): Location {
    const existing = this.findLocation(params.originalName);
    if (existing) return existing;
    
    const location: Location = {
      id: this.generateId('loc'),
      originalName: params.originalName,
      translatedName: params.translatedName,
      type: params.type,
      description: params.description ?? '',
    };
    
    this.glossary.locations.push(location);
    this.touch();
    
    return location;
  }
  
  /**
   * Find location by original name
   */
  findLocation(name: string): Location | undefined {
    return this.glossary.locations.find(
      l => l.originalName.toLowerCase() === name.toLowerCase()
    );
  }
  
  // ============ Term Management ============
  
  /**
   * Add a new term
   */
  addTerm(params: {
    originalTerm: string;
    translatedTerm: string;
    category: Term['category'];
    description?: string;
    context?: string;
  }): Term {
    const existing = this.findTerm(params.originalTerm);
    if (existing) return existing;
    
    const term: Term = {
      id: this.generateId('term'),
      originalTerm: params.originalTerm,
      translatedTerm: params.translatedTerm,
      category: params.category,
      description: params.description ?? '',
      context: params.context,
    };
    
    this.glossary.terms.push(term);
    this.touch();
    
    return term;
  }
  
  /**
   * Find term by original text
   */
  findTerm(term: string): Term | undefined {
    return this.glossary.terms.find(
      t => t.originalTerm.toLowerCase() === term.toLowerCase()
    );
  }
  
  // ============ Batch Operations ============
  
  /**
   * Apply glossary updates from analysis stage
   */
  applyUpdate(update: GlossaryUpdate): void {
    // Add new characters
    for (const char of update.newCharacters) {
      this.addCharacter({
        originalName: char.originalName,
        translatedName: char.translatedName,
        gender: char.gender,
        description: char.description,
        aliases: char.aliases,
        chapterNumber: char.firstAppearance,
        isMainCharacter: char.isMainCharacter,
      });
    }
    
    // Add new locations
    for (const loc of update.newLocations) {
      this.addLocation({
        originalName: loc.originalName,
        translatedName: loc.translatedName,
        type: loc.type,
        description: loc.description,
      });
    }
    
    // Add new terms
    for (const term of update.newTerms) {
      this.addTerm({
        originalTerm: term.originalTerm,
        translatedTerm: term.translatedTerm,
        category: term.category,
        description: term.description,
        context: term.context,
      });
    }
  }
  
  /**
   * Generate prompt-friendly glossary text
   */
  toPromptText(): string {
    let text = '';
    
    if (this.glossary.characters.length > 0) {
      text += '### Персонажи (Characters)\n';
      for (const char of this.glossary.characters) {
        text += `- ${char.originalName} → ${char.translatedName}`;
        text += ` [${char.gender}]`;
        text += ` (род.п.: ${char.declensions.genitive}, дат.п.: ${char.declensions.dative})`;
        if (char.description) {
          text += ` - ${char.description}`;
        }
        if (char.aliases.length > 0) {
          text += ` Также: ${char.aliases.join(', ')}`;
        }
        text += '\n';
      }
      text += '\n';
    }
    
    if (this.glossary.locations.length > 0) {
      text += '### Локации (Locations)\n';
      for (const loc of this.glossary.locations) {
        text += `- ${loc.originalName} → ${loc.translatedName}`;
        if (loc.description) {
          text += ` - ${loc.description}`;
        }
        text += '\n';
      }
      text += '\n';
    }
    
    if (this.glossary.terms.length > 0) {
      text += '### Термины (Terms)\n';
      for (const term of this.glossary.terms) {
        text += `- ${term.originalTerm} → ${term.translatedTerm}`;
        if (term.description) {
          text += ` (${term.description})`;
        }
        text += '\n';
      }
    }
    
    return text;
  }
  
  // ============ Utility ============
  
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private touch(): void {
    this.glossary.version++;
    this.glossary.lastUpdated = new Date();
  }
  
  // Getters
  get characterCount(): number { return this.glossary.characters.length; }
  get locationCount(): number { return this.glossary.locations.length; }
  get termCount(): number { return this.glossary.terms.length; }
  get version(): number { return this.glossary.version; }
}

