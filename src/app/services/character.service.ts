// character.service.ts (completo y corregido)
import { Injectable, Signal, computed, signal } from '@angular/core';
import { CharacterSheet } from '../models/character';

export interface CharacterDoc {
  id: string;
  sheet: CharacterSheet;
}

function uid(prefix = 'c'): string {
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

/** Defaults seguros según tu modelo */
function defaultSheet(): CharacterSheet {
  return {
    name: 'Nuevo personaje',
    clazz: '',
    level: 1,
    ancestry: '',
    alignment: '',
    image: '',
    ac: 10,
    hp: 10,
    maxHp: 10,
    speed: 30,
    profBonus: 2,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } as any,
    skills: {},
    senses: {},
    features: [],     // OJO: arrays si tu modelo los define así
    inventory: '',
    spells: '',
    notes: ''
  } as CharacterSheet;
}

/** Migra/normaliza un CharacterDoc que viene de localStorage */
function normalizeDoc(d: Partial<CharacterDoc>): CharacterDoc {
  const base = defaultSheet();
  const s: any = { ...base, ...(d?.sheet ?? {}) };

  // Normalizaciones por si cambió el esquema entre versiones
  if (Array.isArray(s.features) === false) s.features = (s.features ?? '').toString().split('\n').filter(Boolean);
  if (s.skills == null || typeof s.skills !== 'object') s.skills = {};
  if (s.senses == null || typeof s.senses !== 'object') s.senses = {};
  if (s.abilities == null || typeof s.abilities !== 'object') s.abilities = base.abilities;

  // Números razonables
  s.level = Math.max(1, Number(s.level || 1));
  s.ac = Math.max(1, Number(s.ac || 10));
  s.maxHp = Math.max(1, Number(s.maxHp || 8));
  s.hp = Math.max(0, Math.min(Number(s.hp || 8), s.maxHp));
  s.speed = Math.max(0, Number(s.speed || 30));
  s.profBonus = Math.max(1, Number(s.profBonus || 2));

  return {
    id: d?.id || uid(),
    sheet: s as CharacterSheet
  };
}

/** Lectura única desde localStorage sin tocar señales */
function readFromStorage(key: string): { docs: CharacterDoc[]; selectedId: string | null } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { docs: [], selectedId: null };
    const parsed = JSON.parse(raw) as { docs?: Partial<CharacterDoc>[]; selectedId?: string | null };

    const docs = (parsed.docs ?? []).map(normalizeDoc).filter(Boolean);
    const selectedId = parsed.selectedId && docs.some(d => d.id === parsed.selectedId)
      ? parsed.selectedId!
      : (docs[0]?.id ?? null);

    return { docs, selectedId };
  } catch {
    // Si hay datos corruptos, devolvemos vacío
    return { docs: [], selectedId: null };
  }
}

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private STORAGE_KEY = 'rpg.multichar.v1';

  // 1) Leemos una sola vez del storage, sin tocar aún señales
  private readonly _initial = (() => {
    const { docs, selectedId } = readFromStorage(this.STORAGE_KEY);
    // Si no había nada, creamos uno por defecto
    if (!docs.length) {
      const first: CharacterDoc = { id: uid(), sheet: defaultSheet() };
      return { docs: [first], selectedId: first.id };
    }
    return { docs, selectedId: selectedId ?? docs[0].id };
  })();

  // 2) Creamos señales con esos valores iniciales (sin efectos secundarios)
  readonly sheets = signal<CharacterDoc[]>(this._initial.docs);
  readonly selectedId = signal<string | null>(this._initial.selectedId);

  // 3) Hoja seleccionada como Signal<CharacterSheet>
  readonly sheet: Signal<CharacterSheet> = computed(() => {
    const sel = this.selectedId();
    const doc = this.sheets().find(d => d.id === sel);
    // Nunca devolvemos undefined para no romper el binding
    return (doc?.sheet ?? defaultSheet());
  });

  // ===== API =====
  updateSelected(mut: (s: CharacterSheet) => CharacterSheet) {
    const id = this.selectedId();
    if (!id) return;
    this.sheets.update(arr => arr.map(d => (d.id === id ? { ...d, sheet: mut(d.sheet) } : d)));
    this.saveToStorage();
  }

  patchSelected(patch: Partial<CharacterSheet>) {
    this.updateSelected(s => ({ ...s, ...patch }));
  }

  select(id: string) {
    if (this.sheets().some(d => d.id === id)) {
      this.selectedId.set(id);
      this.saveToStorage();
    }
  }

  createNew(initial?: Partial<CharacterSheet>): string {
    const id = uid();
    const doc: CharacterDoc = { id, sheet: normalizeDoc({ sheet: { ...defaultSheet(), ...(initial || {}) } }).sheet };
    this.sheets.update(arr => [...arr, doc]);
    this.selectedId.set(id);
    this.saveToStorage();
    return id;
  }

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

  delete(id: string) {
    const next = this.sheets().filter(d => d.id !== id);
    this.sheets.set(next);
    if (!next.length) {
      this.selectedId.set(null);
    } else if (!next.some(d => d.id === this.selectedId())) {
      this.selectedId.set(next[0].id);
    }
    this.saveToStorage();
  }

  saveLocal() {
    this.saveToStorage();
  }

  // ======= “Mesa” (stub) =======
  readonly roomChars = signal<Array<{ sheet: CharacterSheet }>>([]);
  shareToTable() {
    const sel = this.sheet();
    this.roomChars.update(arr => [...arr, { sheet: { ...sel } }]);
  }
  requestAll() {}

  // ======= Persistencia =======
  private saveToStorage() {
    try {
      const payload = JSON.stringify({
        selectedId: this.selectedId(),
        docs: this.sheets()
      });
      localStorage.setItem(this.STORAGE_KEY, payload);
    } catch {
      // ignore write errors (quota, etc.)
    }
  }
}
