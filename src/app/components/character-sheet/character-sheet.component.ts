import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { Component, Signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CharacterSheet, SkillName } from '../../models/character';
import { CharacterService } from '../../services/character.service';

import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { CharacterDoc } from '../../services/character.service';

/** Abreviaturas de habilidades base (D&D) */
type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/** Extensión local para manejar XP sin romper el modelo externo */
type SheetWithXp = CharacterSheet & { xp?: number };

/** Tabla de XP acumulada por nivel (D&D 5e) */
const XP_TABLE: Record<number, number> = {
  1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000, 9: 48000, 10: 64000,
  11: 85000, 12: 100000, 13: 120000, 14: 140000, 15: 165000, 16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000
};
const MAX_LEVEL = 20;

@Component({
  selector: 'app-character-sheet',
  standalone: true,
  imports: [
    FormsModule, NgFor, NgIf,
    NzCardModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzButtonModule, NzGridModule, NzTabsModule, NzAvatarModule,
    NzTagModule, NzTypographyModule, NzProgressModule, DecimalPipe,
    NzDropDownModule, NzIconModule, NzToolTipModule,
  ],
  templateUrl: './character-sheet.component.html',
  styleUrl: './character-sheet.component.scss',
  providers: [NzMessageService]
})
export class CharacterSheetComponent {
  private svc = inject(CharacterService);
  private msg = inject(NzMessageService);

  // Multi-ficha
  sheets = this.svc.sheets;              // signal<CharacterDoc[]>
  selectedId = this.svc.selectedId;      // signal<string|null>

  // Ficha seleccionada (compatibilidad con tu código existente)
  sheet: Signal<CharacterSheet> = this.svc.sheet;

  // Grupo/mesa
  party = this.svc.roomChars;

  // ===== I18N de etiquetas =====
  readonly abilitiesOrder: readonly AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  readonly abilityLabels: Readonly<Record<AbilityKey, string>> = {
    str: 'Fuerza',
    dex: 'Destreza',
    con: 'Constitución',
    int: 'Inteligencia',
    wis: 'Sabiduría',
    cha: 'Carisma'
  };

  readonly skills: ReadonlyArray<SkillName> = [
    'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation',
    'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand',
    'Stealth', 'Survival'
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

  // ===== Estado auxiliar XP/undo =====
  xpRevoke: number = 0;
  private lastAwards: number[] = [];

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
  xpAward: number = 0; // ngModel del otorgador de PX

  // ===== Utilidad UI =====
  labelAbility(k: AbilityKey): string { return this.abilityLabels[k] ?? k; }
  labelSkill(k: SkillName): string { return this.skillLabels[k] ?? k; }
  isPositive(v: any): boolean { return Number.isFinite(Number(v)) && Number(v) > 0; }
  canRevoke(): boolean { return this.lastAwards.length > 0; }

  // ===== CRUD multi-ficha =====
  select(id: string) { this.svc.select(id); this.lastAwards = []; }
  newChar() { this.svc.createNew(); this.msg.success('Nueva ficha creada.'); }
  duplicateChar() {
    const id = this.svc.duplicateSelected();
    if (id) this.msg.success('Copia creada (Nivel 1, HP al máximo).');
  }
  deleteChar(id: string) {
    const curr = this.selectedId();
    this.svc.delete(id);
    if (curr === id) this.lastAwards = [];
    this.msg.info('Ficha eliminada.');
  }

  // ===== Persistencia / compartir =====
  saveLocal() { this.svc.saveLocal(); this.msg.success('Todas las fichas guardadas localmente.'); }
  share() { this.svc.shareToTable(); this.msg.success('Ficha compartida con la mesa.'); this.svc.requestAll(); }

  // ===== Mutadores (vía servicio) =====
  update<K extends keyof CharacterSheet>(key: K, val: CharacterSheet[K]) {
    this.svc.patchSelected({ [key]: val } as Partial<CharacterSheet>);
  }
  updateAbility(k: AbilityKey, val: number) {
    this.svc.updateSelected(s => ({ ...s, abilities: { ...s.abilities, [k]: val } as any }));
  }
  toggleSkill(k: SkillName) {
    const curr = this.sheet().skills?.[k] ?? 'none';
    const next = curr === 'none' ? 'prof' : curr === 'prof' ? 'expert' : 'none';
    this.svc.updateSelected(s => ({ ...s, skills: { ...(s.skills || {}), [k]: next } }));
  }

  // ===== PX/Nivel =====
  private levelFromXp(totalXp: number): number {
    let lvl = 1;
    for (let i = 2; i <= MAX_LEVEL; i++) {
      if (totalXp >= XP_TABLE[i]) lvl = i; else break;
    }
    return lvl;
  }

  nextLevelThreshold(lvl: number): number | null {
    const next = lvl + 1;
    return next <= MAX_LEVEL ? XP_TABLE[next] : null;
  }

  xpProgress(): number {
    const xp = this.xp();
    const lvl = this.levelFromXp(xp);
    const next = this.nextLevelThreshold(lvl);
    const prev = XP_TABLE[lvl];
    if (next === null) return 100;
    const pct = Math.floor(((xp - prev) / (next - prev)) * 100);
    return Math.max(0, Math.min(100, pct));
  }

  setXp(newXp: number) {
    const sanitized = Math.max(0, Math.floor(Number(newXp) || 0));
    const beforeLevel = this.sheet().level;
    this.svc.updateSelected(s => ({ ...(s as SheetWithXp), xp: sanitized } as CharacterSheet));
    this.syncLevelWithXp(beforeLevel);
  }

  grantXp(amount: number) {
    const add = Math.floor(Number(amount) || 0);
    if (add <= 0) { this.msg.warning('Cantidad de PX inválida.'); return; }
    const curr = this.xp();
    const nextTotal = Math.max(0, curr + add);
    const beforeLevel = this.sheet().level;

    this.lastAwards.push(add);
    this.svc.updateSelected(s => ({ ...(s as SheetWithXp), xp: nextTotal } as CharacterSheet));
    this.msg.success(`Se otorgaron ${add} PX. Total: ${nextTotal.toLocaleString()}.`);
    this.xpAward = 0;

    this.syncLevelWithXp(beforeLevel);
  }

  removeXp(amount: number) {
    const sub = Math.floor(Number(amount) || 0);
    if (sub <= 0) { this.msg.warning('Cantidad de PX a quitar inválida.'); return; }
    const curr = this.xp();
    const nextTotal = Math.max(0, curr - sub);
    const beforeLevel = this.sheet().level;

    this.svc.updateSelected(s => ({ ...(s as SheetWithXp), xp: nextTotal } as CharacterSheet));
    this.msg.info(`Se quitaron ${sub} PX. Total: ${nextTotal.toLocaleString()}.`);
    this.xpRevoke = 0;

    this.syncLevelWithXp(beforeLevel);
  }

  revokeLastXp() {
    const last = this.lastAwards.pop();
    if (!last) { this.msg.warning('No hay otorgamientos para deshacer.'); return; }
    const curr = this.xp();
    const nextTotal = Math.max(0, curr - last);
    const beforeLevel = this.sheet().level;

    this.svc.updateSelected(s => ({ ...(s as SheetWithXp), xp: nextTotal } as CharacterSheet));
    this.msg.info(`Deshecho: -${last} PX. Total: ${nextTotal.toLocaleString()}.`);

    this.syncLevelWithXp(beforeLevel);
  }

  private syncLevelWithXp(previousLevel: number) {
    const recalculated = this.levelFromXp(this.xp());
    if (recalculated !== previousLevel) {
      this.svc.patchSelected({ level: recalculated });
      if (recalculated > previousLevel) {
        this.msg.success(`¡Subes a nivel ${recalculated}!`);
      } else {
        this.msg.warning(`Bajas a nivel ${recalculated}.`);
      }
    }
  }

  // ===== Helpers de UI para cabecera de selección =====
  displayName(doc: CharacterDoc): string {
    const s = doc.sheet;
    return s.name?.trim() || 'Sin nombre';
  }
}
