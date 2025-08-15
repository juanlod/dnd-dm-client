import { Component, HostBinding, inject, effect } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { CombatFxService, FxEvent } from 'src/app/services/combat-fx.service';

@Component({
  selector: 'app-combat-fx-overlay',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './combat-fx-overlay.component.html',
  styleUrl: './combat-fx-overlay.component.scss'
})
export class CombatFxOverlayComponent {
  private fx = inject(CombatFxService);
  events = this.fx.events;
  trackById = (_: number, e: FxEvent) => e.id;

  @HostBinding('class.shake') get shake() { return this._shake; }
  private _shake = false;

  constructor() {
    // Si hay un crítico, aplicamos "shake" breve al overlay
    effect(() => {
      const hasCrit = this.events().some(e => e.type === 'crit');
      if (hasCrit) {
        this._shake = true;
        setTimeout(() => (this._shake = false), 500);
      }
    });
  }
}
