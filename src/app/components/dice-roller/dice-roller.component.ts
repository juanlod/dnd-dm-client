import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-dice-roller',
  standalone: true,
  imports: [
    NgFor, FormsModule,
    NzButtonModule, NzInputNumberModule, NzTagModule, NzTypographyModule, NzToolTipModule
  ],
  templateUrl: './dice-roller.component.html',
  styleUrl: './dice-roller.component.scss'
})
export class DiceRollerComponent {
  private chat = inject(ChatService);
  readonly types = [4, 6, 8, 10, 12, 20, 100];

  qty = signal<number>(1);
  faces = signal<number>(20);
  mod = signal<number>(0);

  notation = computed(() => {
    const q = Math.max(1, Math.min(50, Math.round(this.qty() || 1)));
    const f = this.faces();
    const m = Math.round(this.mod() || 0);
    const sign = m === 0 ? '' : (m > 0 ? `+${m}` : `${m}`);
    return `${q}d${f}${sign}`;
  });

  onDieClick(f: number, ev?: MouseEvent) {
    const onlySelect = !!(ev && (ev.shiftKey || ev.ctrlKey || ev.metaKey));
    this.faces.set(f);
    if (!onlySelect) this.roll();
  }
  incQty(d: number) { this.qty.set(Math.max(1, Math.min(50, Math.round((this.qty() || 1) + d)))); }
  incMod(d: number) { this.mod.set(Math.max(-999, Math.min(999, Math.round((this.mod() || 0) + d)))); }
  setPreset(q: number, f: number, m = 0) { this.qty.set(q); this.faces.set(f); this.mod.set(m); this.roll(); }
  roll() { this.chat.roll(this.notation()); }
}
