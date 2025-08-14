import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { CharacterService } from '../../services/character.service';
import { CharacterSheet, SkillName } from '../../models/character';

import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzProgressModule } from 'ng-zorro-antd/progress';

/** Abreviaturas de habilidades base (D&D) */
type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/** Extensión local para manejar XP sin romper el modelo externo */
type SheetWithXp = CharacterSheet & { xp?: number };

/** Tabla de XP acumulada por nivel (D&D 5e) */
const XP_TABLE: Record<number, number> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
  6: 14000,
  7: 23000,
  8: 34000,
  9: 48000,
  10: 64000,
  11: 85000,
  12: 100000,
  13: 120000,
  14: 140000,
  15: 165000,
  16: 195000,
  17: 225000,
  18: 265000,
  19: 305000,
  20: 355000
};
const MAX_LEVEL = 20;

@Component({
  selector: 'app-character-sheet',
  standalone: true,
  imports: [
    FormsModule, NgFor, NgIf,
    NzCardModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzButtonModule, NzGridModule, NzTabsModule, NzAvatarModule,
    NzTagModule, NzTypographyModule, NzProgressModule, DecimalPipe
  ],
  templateUrl: './character-sheet.component.html',
  styleUrl: './character-sheet.component.scss',
  providers: [NzMessageService]
})
export class CharacterSheetComponent {
  private svc = inject(CharacterService);
  private msg = inject(NzMessageService);

  sheet = this.svc.sheet;         // signal<CharacterSheet>
  party = this.svc.roomChars;     // signal<RoomChar[]>

  // ===== I18N de etiquetas =====
  readonly abilitiesOrder: readonly AbilityKey[] = ['str','dex','con','int','wis','cha'] as const;
  readonly abilityLabels: Readonly<Record<AbilityKey, string>> = {
    str: 'Fuerza',
    dex: 'Destreza',
    con: 'Constitución',
    int: 'Inteligencia',
    wis: 'Sabiduría',
    cha: 'Carisma'
  };

  readonly skills: ReadonlyArray<SkillName> = [
    'Acrobatics','Animal Handling','Arcana','Athletics','Deception','History','Insight','Intimidation',
    'Investigation','Medicine','Nature','Perception','Performance','Persuasion','Religion','Sleight of Hand',
    'Stealth','Survival'
  ];
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

  labelAbility(k: AbilityKey): string { return this.abilityLabels[k] ?? k; }
  labelSkill(k: SkillName): string { return this.skillLabels[k] ?? k; }

  // ===== Derivados existentes =====
  prof = computed(() => this.sheet().profBonus ?? Math.max(2, Math.ceil(this.sheet().level / 4) + 1));
  mod = (v: number) => Math.floor((Number(v) - 10) / 2);
  pp = computed(() => {
    const base = 10 + this.mod(this.sheet().abilities.wis);
    const st = this.sheet().skills?.Perception;
    const pb = this.prof();
    const extra = st === 'prof' ? pb : st === 'expert' ? pb * 2 : 0;
    const override = this.sheet().senses?.passivePerception;
    return typeof override === 'number' ? override : base + extra;
  });

  // ===== Experiencia y subida de nivel =====
  xp = computed<number>(() => (this.sheet() as SheetWithXp).xp ?? 0);
  xpAward: number = 0; // ngModel del otorgador de XP

  /** Devuelve el nivel correspondiente a un total de XP */
  private levelFromXp(totalXp: number): number {
    let lvl = 1;
    for (let i = 2; i <= MAX_LEVEL; i++) {
      if (totalXp >= XP_TABLE[i]) lvl = i; else break;
    }
    return lvl;
  }

  /** Umbral de XP para el siguiente nivel; null si ya está al máximo */
  nextLevelThreshold(lvl: number): number | null {
    const next = lvl + 1;
    return next <= MAX_LEVEL ? XP_TABLE[next] : null;
  }

  /** Progreso (0–100) hacia el siguiente nivel basado en XP actual */
  xpProgress(): number {
    const xp = this.xp();
    const lvl = this.levelFromXp(xp);
    const next = this.nextLevelThreshold(lvl);
    const prev = XP_TABLE[lvl];
    if (next === null) return 100;
    const pct = Math.floor(((xp - prev) / (next - prev)) * 100);
    return Math.max(0, Math.min(100, pct));
  }

  /** Establecer XP directamente */
  setXp(newXp: number) {
    const sanitized = Math.max(0, Math.floor(Number(newXp) || 0));
    const beforeLevel = this.sheet().level;
    // Actualiza XP
    this.sheet.update(s => ({ ...(s as SheetWithXp), xp: sanitized } as CharacterSheet));
    // Sincroniza nivel si corresponde
    this.syncLevelWithXp(beforeLevel);
  }

  /** Añadir XP (otorgar) */
  grantXp(amount: number) {
    const add = Math.floor(Number(amount) || 0);
    if (add <= 0) {
      this.msg.warning('Cantidad de XP inválida.');
      return;
    }
    const curr = this.xp();
    const nextTotal = curr + add;
    const beforeLevel = this.sheet().level;

    this.sheet.update(s => ({ ...(s as SheetWithXp), xp: nextTotal } as CharacterSheet));
    this.msg.success(`Se otorgaron ${add} PX. Total: ${nextTotal.toLocaleString()}.`);
    this.xpAward = 0;

    this.syncLevelWithXp(beforeLevel);
  }

  /** Recalcula nivel por XP y avisa si hay subida */
  private syncLevelWithXp(previousLevel: number) {
    const newLevel = this.levelFromXp(this.xp());
    if (newLevel > previousLevel) {
      this.sheet.update(s => ({ ...s, level: newLevel }));
      this.msg.success(`¡Subes a nivel ${newLevel}!`);
    }
  }

  // ===== Mutadores seguros existentes =====
  update<K extends keyof CharacterSheet>(key: K, val: CharacterSheet[K]) {
    this.sheet.update(s => ({ ...s, [key]: val }));
  }
  updateAbility(k: AbilityKey, val: number) {
    this.sheet.update(s => ({ ...s, abilities: { ...s.abilities, [k]: val } }));
  }
  toggleSkill(k: SkillName) {
    const curr = this.sheet().skills?.[k] ?? 'none';
    const next = curr === 'none' ? 'prof' : curr === 'prof' ? 'expert' : 'none';
    this.sheet.update(s => ({ ...s, skills: { ...(s.skills || {}), [k]: next } }));
  }

  // ===== Acciones =====
  saveLocal() { this.msg.success('Ficha guardada localmente.'); }
  share() { this.svc.shareToTable(); this.msg.success('Ficha compartida con la mesa.'); this.svc.requestAll(); }
}
