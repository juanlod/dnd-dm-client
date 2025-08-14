import { Component, computed, inject } from '@angular/core';
import { NgFor, NgIf, DecimalPipe } from '@angular/common';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzProgressModule } from 'ng-zorro-antd/progress';

import { CharacterService } from '../../services/character.service';
import { CharacterSheet, SkillName } from '../../models/character';

type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type SheetWithXp = CharacterSheet & { xp?: number };

const XP_TABLE: Record<number, number> = {
  1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000, 9: 48000,
  10: 64000, 11: 85000, 12: 100000, 13: 120000, 14: 140000, 15: 165000,
  16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000
};
const MAX_LEVEL = 20;

@Component({
  selector: 'app-character-summary',
  standalone: true,
  imports: [
    // Angular
    NgFor, NgIf, DecimalPipe,
    // NG-ZORRO
    NzCardModule, NzAvatarModule, NzTagModule, NzTypographyModule, NzGridModule, NzProgressModule
  ],
  templateUrl: './character-summary.component.html',
  styleUrl: './character-summary.component.scss'
})
export class CharacterSummaryComponent {
  private svc = inject(CharacterService);

  // Señal con la hoja del PJ
  sheetSig = this.svc.sheet; // signal<CharacterSheet>

  // ===== Etiquetas / listas =====
  readonly abilitiesOrder: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  readonly abilityLabels: Readonly<Record<AbilityKey, string>> = {
    str: 'Fuerza',
    dex: 'Destreza',
    con: 'Constitución',
    int: 'Inteligencia',
    wis: 'Sabiduría',
    cha: 'Carisma'
  };

  // Lista completa canónica de skills (claves en inglés por compatibilidad con el modelo)
  readonly skills: ReadonlyArray<SkillName> = [
    'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History',
    'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception',
    'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'
  ];

  // Mapeo a etiquetas en español
  readonly skillLabels: Readonly<Record<SkillName, string>> = {
    Acrobatics: 'Acrobacias',
    'Animal Handling': 'Trato con animales',
    Arcana: 'Arcanos',
    Athletics: 'Atletismo',
    Deception: 'Engaño',
    History: 'Historia',
    Insight: 'Perspicacia',
    Intimidation: 'Intimidación',
    Investigation: 'Investigación',
    Medicine: 'Medicina',
    Nature: 'Naturaleza',
    Perception: 'Percepción',
    Performance: 'Interpretación',
    Persuasion: 'Persuasión',
    Religion: 'Religión',
    'Sleight of Hand': 'Juego de manos',
    Stealth: 'Sigilo',
    Survival: 'Supervivencia'
  };

  labelAbility = (k: AbilityKey) => this.abilityLabels[k] ?? k;
  labelSkill = (k: SkillName) => this.skillLabels[k] ?? k;

  // ===== Derivados de reglas =====
  prof = computed(() => {
    const s = this.sheetSig();
    return s.profBonus ?? Math.max(2, Math.ceil(s.level / 4) + 1);
  });

  mod = (v: number) => Math.floor((Number(v) - 10) / 2);

  pp = computed(() => {
    const s = this.sheetSig();
    const base = 10 + this.mod(s.abilities.wis);
    const st = s.skills?.Perception;
    const pb = this.prof();
    const extra = st === 'prof' ? pb : st === 'expert' ? pb * 2 : 0;
    const override = s.senses?.passivePerception;
    return typeof override === 'number' ? override : base + extra;
  });

  // ===== XP / Nivel (solo display) =====
  xp = computed<number>(() => (this.sheetSig() as SheetWithXp).xp ?? 0);

  currentLevel = computed(() => {
    const total = this.xp();
    let lvl = 1;
    for (let i = 2; i <= MAX_LEVEL; i++) {
      if (total >= XP_TABLE[i]) lvl = i;
      else break;
    }
    return lvl;
  });

  nextThreshold = computed(() => {
    const next = this.currentLevel() + 1;
    return next <= MAX_LEVEL ? XP_TABLE[next] : null;
  });

  prevThreshold = computed(() => XP_TABLE[this.currentLevel()]);

  xpProgress = computed(() => {
    const next = this.nextThreshold();
    if (next === null) return 100;
    const curr = this.xp();
    const prev = this.prevThreshold();
    const pct = Math.floor(((curr - prev) / (next - prev)) * 100);
    return Math.max(0, Math.min(100, pct));
  });

  // ===== NUEVO: solo habilidades entrenadas (prof o expert) =====
  trainedSkills = computed<SkillName[]>(() => {
    const skillMap = this.sheetSig().skills || {};
    return this.skills.filter(k => skillMap[k] === 'prof' || skillMap[k] === 'expert');
  });

  // (Opcional) Utilidad para tags si la usas en otros lugares
  skillStatusTag(s: 'none' | 'prof' | 'expert' | undefined): { text: string; color?: string } {
    switch (s) {
      case 'prof':   return { text: 'Competente', color: 'default' };
      case 'expert': return { text: 'Experto', color: 'gold' };
      default:       return { text: '—' };
    }
  }
}
