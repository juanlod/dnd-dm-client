import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ChatPayload, DmPayload, RoomPlayer, SocketService } from './socket.service';

export type MessageType = 'system' | 'user' | 'dm' | 'roll';

/** Mensaje normalizado que consume el chat */
export interface Message {
  type: 'user' | 'dm' | 'roll' | 'system';
  from?: string;
  text?: string;
  ts: number; // epoch ms
}

/** Clave usada para recordar login en localStorage */
const LS_LOGIN_KEY = 'dnddm.login';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private _messages = new BehaviorSubject<Message[]>([]);
  messages$ = this._messages.asObservable();

  private _roomId = '';
  private _name = '';
  get roomId() { return this._roomId; }
  get name()   { return this._name; }

  playersSig = signal<RoomPlayer[]>([]);
  private subs: Subscription[] = [];

  constructor(private socket: SocketService, private router: Router) {
    this.socket.connect();

    // === Suscripciones a eventos del socket ===
    this.subs.push(
      this.socket.joined$.subscribe(({ roomId, nickname }) => {
        // Refuerza identidad por si llega distinta desde el server
        this._roomId = roomId;
        this._name = nickname;

        this.push({
          from: 'System',
          text: `Conectado a "${roomId}" como ${nickname}`,
          type: 'system',
          ts: Date.now()
        });

        // Si aún estás en login, lleva a /mesa
        if (!location.hash.includes('/mesa') && !location.pathname.includes('/mesa')) {
          this.router.navigateByUrl('/mesa');
        }
      }),

      this.socket.system$.subscribe(text =>
        this.push({ from: 'System', text, type: 'system', ts: Date.now() })
      ),

      this.socket.chat$.subscribe((m: ChatPayload) =>
        this.push({ from: m.from, text: m.text, type: 'user', ts: m.ts })
      ),

      this.socket.dm$.subscribe((m: DmPayload) =>
        this.push({ from: 'DM', text: m.text, type: 'dm', ts: m.ts })
      ),

      this.socket.roll$.subscribe(({ from, detail, rolls, total, ts }) => {
        const t = `🎲 ${detail} → [${rolls.join(', ')}] = ${total}`;
        this.push({ from, text: t, type: 'roll', ts });
      }),

      this.socket.players$.subscribe(arr => {
        const sorted = [...arr].sort((a, b) => a.name.localeCompare(b.name));
        this.playersSig.set(sorted);
      })
    );

    // Rejoin automático si hay login guardado
    const saved = this.readSavedLogin();
    if (saved?.name && saved?.roomId) {
      if (this.socket.isConnected()) this.socket.join(saved.roomId, saved.name);

      this.subs.push(
        this.socket.ready$.subscribe(() => {
          const again = this.readSavedLogin();
          if (again?.name && again?.roomId) this.socket.join(again.roomId, again.name);
        })
      );
    }

    // Borrado remoto del chat
    this.socket.chatCleared$.subscribe(({ by }) => {
      this._messages.next([]);
      this.addSystem(`🧹 ${by} vació el chat aquí.`);
    });
  }

  /**
   * Fija identidad local inmediatamente (para que los componentes la vean ya)
   * y la persiste en localStorage.
   */
  setIdentity(name: string, roomId: string) {
    this._name = (name ?? '').trim();
    this._roomId = (roomId ?? '').trim();
    this.saveLogin(this._name, this._roomId);
  }

  /**
   * Inicia sesión: fija identidad YA y solicita el join al servidor.
   * Si el socket aún no está listo, el constructor ya dejó un rejoin al `ready$`
   * que leerá de localStorage y hará `join` cuando conecte.
   */
  login(name: string, roomId: string) {
    if (!name?.trim() || !roomId?.trim()) return;

    // 1) Identidad inmediata para que ChatComponent la tenga desde el primer render
    this.setIdentity(name, roomId);

    // 2) Join inmediato si hay socket conectado ahora
    if (this.socket.isConnected()) {
      this.socket.join(this._roomId, this._name);
    }
    // Si no está conectado aún, el handler de ready$ hará join leyendo localStorage.
  }

  send(text: string, askDm: boolean) {
    if (!text.trim()) return;
    this.socket.sendMessage(text.trim(), askDm);
  }

  roll(notation: string) {
    if (!notation.trim()) return;
    this.socket.rollDice(notation.trim());
  }

  announce(text: string) {
    if (!text?.trim()) return;
    this.socket.announce(text.trim());
  }

  reset() {
    this._messages.next([]);
    this._name = '';
    this._roomId = '';
    this.playersSig.set([]);
    localStorage.removeItem(LS_LOGIN_KEY);
  }

  private push(m: Message) {
    const v = this._messages.value;
    v.push(m);
    if (v.length > 500) v.splice(0, 100);
    this._messages.next([...v]);
  }

  private saveLogin(name: string, roomId: string) {
    try {
      localStorage.setItem(LS_LOGIN_KEY, JSON.stringify({ name, roomId }));
    } catch { /* ignore */ }
  }

  private readSavedLogin(): { name: string; roomId: string } | null {
    try {
      const raw = localStorage.getItem(LS_LOGIN_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj?.name && obj?.roomId) return { name: obj.name, roomId: obj.roomId };
      return null;
    } catch {
      return null;
    }
  }

  addSystem(text: string) {
    const cur = this._messages.value.slice();
    cur.push({ type: 'system', text, ts: Date.now() });
    this._messages.next(cur);
  }

  clearLocal() {
    this._messages.next([]);
  }
}
