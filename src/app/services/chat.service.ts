import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { SocketService, ChatPayload, DmPayload, RollPayload, RoomPlayer } from './socket.service';

export type MessageType = 'system' | 'user' | 'dm' | 'roll';
export interface Message { from: string; text: string; type: MessageType; ts: number; }

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

    this.subs.push(
      this.socket.joined$.subscribe(({ roomId, nickname }) => {
        this._roomId = roomId;
        this._name = nickname;
        this.push({ from: 'System', text: `Conectado a "${roomId}" como ${nickname}`, type: 'system', ts: Date.now() });
        if (!location.hash.includes('/mesa') && !location.pathname.includes('/mesa')) {
          this.router.navigateByUrl('/mesa');
        }
      }),
      this.socket.system$.subscribe(text => this.push({ from: 'System', text, type: 'system', ts: Date.now() })),
      this.socket.chat$.subscribe((m: ChatPayload) => this.push({ from: m.from, text: m.text, type: 'user', ts: m.ts })),
      this.socket.dm$.subscribe((m: DmPayload) => this.push({ from: 'DM', text: m.text, type: 'dm', ts: m.ts })),
      this.socket.roll$.subscribe(({ from, detail, rolls, total, ts }) => {
        const t = `🎲 ${detail} → [${rolls.join(', ')}] = ${total}`;
        this.push({ from, text: t, type: 'roll', ts });
      }),
      this.socket.players$.subscribe(arr => {
        const sorted = [...arr].sort((a, b) => a.name.localeCompare(b.name));
        this.playersSig.set(sorted);
      })
    );

    const saved = this.readSavedLogin();
    if (saved?.name && saved?.roomId) {
      if (this.socket.isConnected()) this.socket.join(saved.roomId, saved.name);
      this.subs.push(this.socket.ready$.subscribe(() => {
        const again = this.readSavedLogin();
        if (again?.name && again?.roomId) this.socket.join(again.roomId, again.name);
      }));
    }
  }

  login(name: string, roomId: string) {
    if (!name?.trim() || !roomId?.trim()) return;
    this.saveLogin(name.trim(), roomId.trim());
    if (this.socket.isConnected()) this.socket.join(roomId.trim(), name.trim());
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
    this._name = ''; this._roomId = '';
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
    try { localStorage.setItem(LS_LOGIN_KEY, JSON.stringify({ name, roomId })); } catch {}
  }
  private readSavedLogin(): { name: string; roomId: string } | null {
    try {
      const raw = localStorage.getItem(LS_LOGIN_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj?.name && obj?.roomId) return { name: obj.name, roomId: obj.roomId };
      return null;
    } catch { return null; }
  }
}
