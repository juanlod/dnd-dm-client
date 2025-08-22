// character.service.ts (completo y comentado)
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { CharacterSheet } from '../models/character';
import { SocketService } from './socket.service';

/** Documento que envuelve una ficha: id estable + datos de la ficha */
export interface CharacterDoc {
  id: string;
  sheet: CharacterSheet;
}

/**
 * Genera un id pseudo-único legible.
 * Formato: c-YYYYMMDDHHmmss-XXXX
 */
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

/**
 * Ficha por defecto, con valores seguros.
 * IMPORTANTE: respeta los tipos reales del modelo (p. ej. features: string[]).
 */
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
    features: [],     // ← si tu modelo define array, iniciamos como []
    inventory: '',
    spells: '',
    notes: ''
  } as CharacterSheet;
}

/**
 * Normaliza/migra un CharacterDoc que viene de localStorage.
 * - Rellena valores por defecto.
 * - Arregla cambios de esquema (p. ej. features string → string[]).
 * - Sanea números a rangos razonables.
 */
function normalizeDoc(d: Partial<CharacterDoc>): CharacterDoc {
  const base = defaultSheet();
  const s: any = { ...base, ...(d?.sheet ?? {}) };

  // --- Migraciones suaves por cambios de esquema ---
  // Si features no es array, lo convertimos desde texto multilínea
  if (Array.isArray(s.features) === false) s.features = (s.features ?? '').toString().split('\n').filter(Boolean);
  // Asegura objetos válidos
  if (s.skills == null || typeof s.skills !== 'object') s.skills = {};
  if (s.senses == null || typeof s.senses !== 'object') s.senses = {};
  if (s.abilities == null || typeof s.abilities !== 'object') s.abilities = base.abilities;

  // --- Saneado de números con límites mínimos ---
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

/**
 * Lee UNA sola vez del localStorage sin tocar señales (para evitar
 * problemas de orden de inicialización).
 * Devuelve documentos normalizados y el id seleccionado si es válido.
 */
function readFromStorage(key: string): { docs: CharacterDoc[]; selectedId: string | null } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { docs: [], selectedId: null };

    const parsed = JSON.parse(raw) as { docs?: Partial<CharacterDoc>[]; selectedId?: string | null };

    // Normaliza cada documento
    const docs = (parsed.docs ?? []).map(normalizeDoc).filter(Boolean);

    // Si el selectedId almacenado no existe en docs, cae al primero
    const selectedId = parsed.selectedId && docs.some(d => d.id === parsed.selectedId)
      ? parsed.selectedId!
      : (docs[0]?.id ?? null);

    return { docs, selectedId };
  } catch {
    // Si el JSON está corrupto o hay cualquier error, arrancamos vacío
    return { docs: [], selectedId: null };
  }
}

@Injectable({ providedIn: 'root' })
export class CharacterService {
  /** Clave de almacenamiento en localStorage */
  private STORAGE_KEY = 'rpg.multichar.v1';
  private socket = inject(SocketService);
  
  /**
   * 1) Leemos localStorage una sola vez en un bloque IIFE.
   *    No tocamos señales dentro del loader para evitar estados inconsistentes.
   *    Si no hay datos, creamos un documento por defecto.
   */
  private readonly _initial = (() => {
    const { docs, selectedId } = readFromStorage(this.STORAGE_KEY);
    if (!docs.length) {
      const first: CharacterDoc = { id: uid(), sheet: defaultSheet() };
      return { docs: [first], selectedId: first.id };
    }
    return { docs, selectedId: selectedId ?? docs[0].id };
  })();

  /**
   * 2) Creamos las señales con los valores iniciales (estado reactivo).
   *    - sheets: colección de fichas.
   *    - selectedId: id de la ficha activa.
   */
  readonly sheets = signal<CharacterDoc[]>(this._initial.docs);
  readonly selectedId = signal<string | null>(this._initial.selectedId);

  /**
   * 3) Signal derivada para obtener la ficha activa (solo lectura).
   *    Nunca devolvemos undefined: si no hay match, devolvemos un default
   *    para que el template no rompa bindings.
   */
  readonly sheet: Signal<CharacterSheet> = computed(() => {
    const sel = this.selectedId();
    const doc = this.sheets().find(d => d.id === sel);
    return (doc?.sheet ?? defaultSheet());
  });

  // =========================
  // =====  API pública  =====
  // =========================

  /**
   * Reemplaza completamente la ficha seleccionada aplicando un mutador.
   * - Persiste el cambio en localStorage.
   */
  updateSelected(mut: (s: CharacterSheet) => CharacterSheet) {
    const id = this.selectedId();
    if (!id) return;
    this.sheets.update(arr => arr.map(d => (d.id === id ? { ...d, sheet: mut(d.sheet) } : d)));
    this.saveToStorage();
  }

  /**
   * Actualiza parcialmente la ficha seleccionada (merge superficial).
   * - Internamente usa updateSelected para mantener un solo punto de guardado.
   */
  patchSelected(patch: Partial<CharacterSheet>) {
    this.updateSelected(s => ({ ...s, ...patch }));
  }

  /**
   * Cambia la ficha activa por id (si existe) y persiste la selección.
   */
  select(id: string) {
    if (this.sheets().some(d => d.id === id)) {
      this.selectedId.set(id);
      this.saveToStorage();
    }
  }

  /**
   * Crea una nueva ficha, opcionalmente con valores iniciales,
   * la añade a la colección, la selecciona y persiste todo.
   * Devuelve el id creado.
   */
  createNew(initial?: Partial<CharacterSheet>): string {
    const id = uid();
    // Normalizamos por si initial trae campos con otro formato
    const doc: CharacterDoc = { id, sheet: normalizeDoc({ sheet: { ...defaultSheet(), ...(initial || {}) } }).sheet };
    this.sheets.update(arr => [...arr, doc]);
    this.selectedId.set(id);
    this.saveToStorage();
    return id;
  }

  /**
   * Duplica la ficha seleccionada como una nueva en nivel 1 y HP al máximo,
   * selecciona la copia y persiste.
   * Devuelve el id de la copia o null si no había seleccionada.
   */
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

  /**
   * Elimina una ficha por id. Si borras la seleccionada:
   * - Si hay más fichas, selecciona la primera.
   * - Si no queda ninguna, selectedId pasa a null.
   * Siempre persiste el nuevo estado.
   */
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

  /**
   * Guarda explícitamente en localStorage.
   * (No es estrictamente necesario porque todas las mutaciones ya guardan,
   *  pero lo exponemos por comodidad de la UI.)
   */
  saveLocal() {
    this.saveToStorage();
  }

  // =========================
  //  “Mesa” (stub/ejemplo)
  // =========================

  /** Lista reactiva de personajes compartidos con la mesa (demo) */
  readonly roomChars = signal<Array<{ sheet: CharacterSheet }>>([]);

  /** Simula compartir el personaje activo a la “mesa” */
  shareToTable() {
    const sel = this.sheet();
    this.roomChars.update(arr => [...arr, { sheet: { ...sel } }]);
    this.socket.emit('character:upsert', { sheet: this.sheet() });
  }

  /** Punto de extensión: pedir fichas compartidas al servidor, etc. */
  requestAll() {}

  // =========================
  //   Persistencia interna
  // =========================

  /**
   * Serializa y guarda en localStorage el estado mínimo:
   * - selectedId: id de la ficha activa
   * - docs: colección completa de fichas
   */
  private saveToStorage() {
    try {
      const payload = JSON.stringify({
        selectedId: this.selectedId(),
        docs: this.sheets()
      });
      localStorage.setItem(this.STORAGE_KEY, payload);
    } catch {
      // Silenciamos errores de escritura (cuota, navegación privada, etc.)
    }
  }
}
