import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CharacterSheet } from '../models/character';
import { ChatService } from './chat.service';
import { SocketService } from './socket.service';

type RoomChar = { id: string; name: string; sheet: CharacterSheet };

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private chat = inject(ChatService);
  private socket = inject(SocketService);

  sheet = signal<CharacterSheet>(this.defaultSheet());
  roomChars = signal<RoomChar[]>([]);

  private storeKey = computed(() => {
    const r = this.chat.roomId || 'default';
    const n = (this.chat.name || '').trim().toLowerCase() || 'anon';
    return `dnddm.sheet.${r}.${n}`;
  });
  private lastLoadedKey: string | null = null;

  constructor() {
    // 1) Cargar cuando cambia sala/usuario
    effect(() => {
      const key = this.storeKey();
      if (key === this.lastLoadedKey) return;
      this.lastLoadedKey = key;
      try {
        const raw = localStorage.getItem(key);
        if (raw) this.sheet.set(JSON.parse(raw));
        else this.sheet.set(this.defaultSheet());
      } catch {}
    }, { allowSignalWrites: true });

    // 2) Auto-guardar ante cambios
    effect(() => {
      const key = this.storeKey();
      const data = JSON.stringify(this.sheet());
      try { localStorage.setItem(key, data); } catch {}
    });

    // 3) Socket: sincronización de mesa
    this.socket.on('character:all', (list: RoomChar[]) => {
      this.roomChars.set(Array.isArray(list) ? list : []);
    });

    // pedir estado al conectar
    this.socket.connected$.subscribe(ok => { if (ok) this.requestAll(); });
  }

  defaultSheet(): CharacterSheet {
    return {
      name: this.chat.name || '',
      clazz: '',
      level: 1,
      ancestry: '',
      alignment: '',
      ac: 10,
      maxHp: 10,
      hp: 10,
      speed: 30,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      skills: {},
      senses: { passivePerception: 10 },
      features: [],
      inventory: '',
      spells: '',
      notes: '',
      image: ''
    };
  }

  shareToTable() { this.socket.emit('character:upsert', { sheet: this.sheet() }); }
  requestAll()   { this.socket.emit('character:getAll'); }
}
