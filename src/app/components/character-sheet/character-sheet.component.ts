import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, KeyValuePipe } from '@angular/common';
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

@Component({
  selector: 'app-character-sheet',
  standalone: true,
  imports: [
    FormsModule, NgFor, NgIf,
    NzCardModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzButtonModule, NzGridModule, NzTabsModule, NzAvatarModule,
    NzTagModule, NzTypographyModule
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

  // Listas para *ngFor
  readonly abilitiesOrder = ['str','dex','con','int','wis','cha'] as const;
  readonly skills: ReadonlyArray<SkillName> = [
    'Acrobatics','Animal Handling','Arcana','Athletics','Deception','History','Insight','Intimidation',
    'Investigation','Medicine','Nature','Perception','Performance','Persuasion','Religion','Sleight of Hand',
    'Stealth','Survival'
  ];

  // Derivados
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

  // Mutadores seguros (crean nuevo objeto -> el signal emite)
  update<K extends keyof CharacterSheet>(key: K, val: CharacterSheet[K]) {
    this.sheet.update(s => ({ ...s, [key]: val }));
  }
  updateAbility(k: typeof this.abilitiesOrder[number], val: number) {
    this.sheet.update(s => ({ ...s, abilities: { ...s.abilities, [k]: val } }));
  }
  toggleSkill(k: SkillName) {
    const curr = this.sheet().skills?.[k] ?? 'none';
    const next = curr === 'none' ? 'prof' : curr === 'prof' ? 'expert' : 'none';
    this.sheet.update(s => ({ ...s, skills: { ...(s.skills || {}), [k]: next } }));
  }

  saveLocal() { this.msg.success('Ficha guardada localmente.'); }
  share() { this.svc.shareToTable(); this.msg.success('Ficha compartida con la mesa.'); this.svc.requestAll(); }
}
