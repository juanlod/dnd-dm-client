import { Injectable, signal } from '@angular/core';

export type FxType = 'hit' | 'crit' | 'miss' | 'heal' | 'damage' | 'shield' | 'spell';

export interface FxEvent {
  id: number;
  type: FxType;
  label?: string;
  color?: string;   // color principal del efecto
  x?: number;       // posición X en %, 0–100 (default 50)
  y?: number;       // posición Y en %, 0–100 (default 50)
  amount?: number;  // para daño/curación
  ttl?: number;     // duración en ms (se autodestruye)
}

@Injectable({ providedIn: 'root' })
export class CombatFxService {
  private _events = signal<FxEvent[]>([]);
  events = this._events.asReadonly();
  private _id = 0;

  trigger(e: Omit<FxEvent, 'id'>) {
    const id = ++this._id;
    const ev: FxEvent = { id, ttl: 1200, ...e };
    this._events.update(list => [...list, ev]);
    setTimeout(() => this.remove(id), ev.ttl);
    return id;
  }

  remove(id: number) {
    this._events.update(list => list.filter(e => e.id !== id));
  }

  // Atajos
  hit(opts: Partial<FxEvent> = {})     { return this.trigger({ type: 'hit',    color: '#ef4444', ...opts }); }
  crit(opts: Partial<FxEvent> = {})    { return this.trigger({ type: 'crit',   color: '#f59e0b', ttl: 1400, ...opts }); }
  miss(opts: Partial<FxEvent> = {})    { return this.trigger({ type: 'miss',   color: '#94a3b8', ...opts }); }
  heal(amount: number, opts: Partial<FxEvent> = {})   { return this.trigger({ type: 'heal',   color: '#10b981', amount, ...opts }); }
  damage(amount: number, opts: Partial<FxEvent> = {}) { return this.trigger({ type: 'damage', color: '#ef4444', amount, ...opts }); }
  shield(opts: Partial<FxEvent> = {})  { return this.trigger({ type: 'shield', color: '#60a5fa', ...opts }); }
  spell(opts: Partial<FxEvent> = {})   { return this.trigger({ type: 'spell',  color: '#a78bfa', ...opts }); }
}
