import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { CharacterSheet } from '../models/character';
import { SocketService } from './socket.service';

/** Envoltorio de documento: id estable + ficha */
export interface CharacterDoc {
  id: string;
  sheet: CharacterSheet;
}

/** Util simple para ids sin dependencias externas */
function uid(prefix = 'c'): string {
  // c-YYYYMMDDHHmmss-XXXX (bastante único para este caso)
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = new Date();
  const ts = [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join('');
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${prefix}-${ts}-${rand}`;
}

/** Ficha vacía por defecto */
function defaultSheet(): CharacterSheet {
  return {
    name: 'Nuevo personaje',
    clazz: '',
    level: 1,
    ancestry: '',
    alignment: '',
    image: '',
    ac: 10,
    hp: 8,
    maxHp: 8,
    speed: 30,
    profBonus: 2,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } as any,
    skills: {},
    senses: {},
    /** IMPORTANTE: array, no string */
    features: [],
    inventory: '',
    spells: '',
    notes: ''
  } as CharacterSheet;
}


@Injectable({ providedIn: 'root' })
export class CharacterService {
  private STORAGE_KEY = 'rpg.multichar.v1';
  private socket = inject(SocketService);
  /** Colección de fichas */
  readonly sheets = signal<CharacterDoc[]>(this.loadFromStorage());

  /** Ficha seleccionada (id) */
  readonly selectedId = signal<string | null>(this.sheets().length ? this.sheets()[0].id : null);

  /** Acceso a la ficha seleccionada como Signal<CharacterSheet> (para compatibilidad con tu componente) */
  readonly sheet: Signal<CharacterSheet> = computed(() => {
    const sel = this.selectedId();
    const doc = this.sheets().find(d => d.id === sel);
    return (doc?.sheet ?? defaultSheet());
  });

  /** Reemplaza por completo la ficha seleccionada */
  updateSelected(mut: (s: CharacterSheet) => CharacterSheet) {
    const id = this.selectedId();
    if (!id) return;
    this.sheets.update(arr =>
      arr.map(d => (d.id === id ? { ...d, sheet: mut(d.sheet) } : d))
    );
    this.saveToStorage();
  }

  /** Actualiza parcialmente la ficha seleccionada */
  patchSelected(patch: Partial<CharacterSheet>) {
    this.updateSelected(s => ({ ...s, ...patch }));
  }

  /** Cambia la ficha activa */
  select(id: string) {
    if (this.sheets().some(d => d.id === id)) {
      this.selectedId.set(id);
    }
  }

  /** Crea una nueva ficha y la selecciona */
  createNew(initial?: Partial<CharacterSheet>): string {
    const id = uid();
    const doc: CharacterDoc = { id, sheet: { ...defaultSheet(), ...(initial || {}) } };
    this.sheets.update(arr => [...arr, doc]);
    this.selectedId.set(id);
    this.saveToStorage();
    return id;
  }

  /** Duplica la ficha actual y la selecciona */
  duplicateSelected(): string | null {
    const id = this.selectedId();
    if (!id) return null;
    const src = this.sheets().find(d => d.id === id);
    if (!src) return null;

    const cloneId = uid();
    const clone: CharacterDoc = {
      id: cloneId,
      sheet: {
        ...src.sheet,
        name: src.sheet.name ? `${src.sheet.name} (copia)` : 'Nuevo personaje',
        level: 1,
        hp: Math.max(1, Number(src.sheet.maxHp) || 1)
      }
    };
    this.sheets.update(arr => [...arr, clone]);
    this.selectedId.set(cloneId);
    this.saveToStorage();
    return cloneId;
  }

  /** Elimina una ficha */
  delete(id: string) {
    const next = this.sheets().filter(d => d.id !== id);
    this.sheets.set(next);
    // Reajusta selección
    if (!next.length) {
      this.selectedId.set(null);
    } else if (!next.some(d => d.id === this.selectedId())) {
      this.selectedId.set(next[0].id);
    }
    this.saveToStorage();
  }

  /** Guarda en localStorage (todas las fichas) */
  saveLocal() {
    this.saveToStorage();
  }

  // ======= Métodos relacionados con “mesa” (stub/compatibilidad) =======
  /** Lista de personajes compartidos (tal y como usas en la UI) */
  readonly roomChars = signal<Array<{ sheet: CharacterSheet }>>([]);

  shareToTable() {
    // Implementa aquí tu lógica real de compartir; de momento empujamos la seleccionada a la lista visual
    const sel = this.sheet();
    this.roomChars.update(arr => [...arr, { sheet: { ...sel } }]);
    this.socket.emit('character:upsert', { sheet: this.sheet() });
  }

  requestAll() {
    // Carga desde red en caso real
  }

  // ======= Persistencia =======
  private saveToStorage() {
    try {
      const payload = JSON.stringify({
        selectedId: this.selectedId(),
        docs: this.sheets()
      });
      localStorage.setItem(this.STORAGE_KEY, payload);
    } catch { /* ignore */ }
  }

  private loadFromStorage(): CharacterDoc[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [ { id: uid(), sheet: defaultSheet() } ];
      const parsed = JSON.parse(raw) as { selectedId: string | null; docs: CharacterDoc[] };
      // asegura ids y estructura
      const docs = (parsed.docs || []).map(d => ({ id: d.id || uid(), sheet: d.sheet || defaultSheet() }));
      // restaura selección si existe
      if (parsed.selectedId && docs.some(d => d.id === parsed.selectedId)) {
        this.selectedId.set(parsed.selectedId);
      }
      return docs.length ? docs : [ { id: uid(), sheet: defaultSheet() } ];
    } catch {
      return [ { id: uid(), sheet: defaultSheet() } ];
    }
  }
}
