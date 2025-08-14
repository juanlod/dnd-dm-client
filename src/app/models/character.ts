// Tipado simple y práctico para D&D 5e
export interface AbilityBlock {
    str: number; dex: number; con: number; int: number; wis: number; cha: number;
  }
  export type SkillName =
    | 'Acrobatics' | 'Animal Handling' | 'Arcana' | 'Athletics'
    | 'Deception' | 'History' | 'Insight' | 'Intimidation'
    | 'Investigation' | 'Medicine' | 'Nature' | 'Perception'
    | 'Performance' | 'Persuasion' | 'Religion' | 'Sleight of Hand'
    | 'Stealth' | 'Survival';
  
  export interface CharacterSheet {
    name: string;              // nombre del PJ (debe coincidir con el del chat idealmente)
    ancestry?: string;         // raza / linaje
    clazz?: string;            // clase
    level: number;
    alignment?: string;
  
    ac: number;
    maxHp: number;
    hp: number;
    speed: number;
  
    abilities: AbilityBlock;
  
    profBonus?: number;        // por si lo quieres fijar; si no, se deriva del nivel
    skills?: Partial<Record<SkillName, 'none' | 'prof' | 'expert'>>;
    senses?: {
      passivePerception?: number;
      passiveInvestigation?: number;
      passiveInsight?: number;
    };
  
    features?: string[];       // rasgos/clase/raza
    inventory?: string;        // texto libre
    spells?: string;           // texto libre
    notes?: string;            // texto libre
    image?: string;            // URL
  }
  