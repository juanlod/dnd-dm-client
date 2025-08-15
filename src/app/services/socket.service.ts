import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from 'src/environments/environment';

export interface JoinedPayload { roomId: string; nickname: string; role?: 'dm' | 'player'; }
export interface ChatPayload { from: string; text: string; ts: number; }
export interface DmPayload { from: 'DM'; text: string; ts: number; }
export interface RollPayload { from: string; notation: string; detail: string; rolls: number[]; total: number; ts: number; }
export interface RoomPlayer { id: string; name: string; role?: 'dm' | 'player'; }

export interface CombatUpdate {
  roomId: string;
  list: { id: string; name: string; init: number }[];
  round: number;
  turnIndex: number;
  durationSec?: number;
  autoAdvance?: boolean;
  autoDelaySec?: number;
  running?: boolean;
  endAt?: number;
  serverNow?: number;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket?: Socket;
  private connected = false;
  private readonly url = environment.apiBase;

  joined$ = new Subject<JoinedPayload>();
  system$ = new Subject<string>();
  chat$ = new Subject<ChatPayload>();
  dm$ = new Subject<DmPayload>();
  roll$ = new Subject<RollPayload>();
  players$ = new Subject<RoomPlayer[]>();
  combat$ = new Subject<CombatUpdate>();

  ready$ = new Subject<void>();
  connected$ = new Subject<boolean>();
  connectErr$ = new Subject<any>();
  /** Emite cuando el servidor pide limpiar el chat */
  readonly chatCleared$ = new Subject<{ by: string; ts: number }>();

  connect(): void {
    if (this.connected && this.socket) return;

    this.socket = io(this.url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
    });

    this.socket.on('connect', () => { this.connected = true; this.connected$.next(true); this.ready$.next(); });
    this.socket.on('reconnect', () => { this.connected = true; this.connected$.next(true); this.ready$.next(); });
    this.socket.on('disconnect', () => { this.connected = false; this.connected$.next(false); });
    this.socket.io.on('error', (err: any) => this.connectErr$.next(err));
    this.socket.on('connect_error', (err: any) => this.connectErr$.next(err));

    this.socket.on('joined', (d: JoinedPayload) => this.joined$.next(d));
    this.socket.on('system', (t: string) => this.system$.next(t));
    this.socket.on('chat', (m: ChatPayload) => this.chat$.next(m));
    this.socket.on('dm', (m: DmPayload) => this.dm$.next(m));
    this.socket.on('roll', (m: RollPayload) => this.roll$.next(m));
    this.socket.on('presence', (arr: RoomPlayer[]) => this.players$.next(arr));
    this.socket.on('combat:update', (st: CombatUpdate) => this.combat$.next(st));
    this.socket.on('chat:cleared', (p: { by: string; ts: number }) => {
      this.chatCleared$.next(p);
    });
  }

  join(roomId: string, name: string, role: 'dm' | 'player' = 'player') {
    this.socket?.emit('join', { roomId, name, role });
  }
  sendMessage(text: string, dm = false) { this.socket?.emit('chat', { text, dm }); }
  rollDice(notation: string) { this.socket?.emit('roll', { notation }); }
  requestPresence() { this.socket?.emit('getPresence'); }
  announce(text: string) { this.socket?.emit('announce', { text }); }

  // Combate (idéntico a antes)
  combatGet() { this.socket?.emit('combat:get'); }
  combatStart(opts: { durationSec?: number; autoAdvance?: boolean; autoDelaySec?: number }) { this.socket?.emit('combat:start', opts); }
  combatReroll() { this.socket?.emit('combat:reroll'); }
  combatNext() { this.socket?.emit('combat:next'); }
  combatPrev() { this.socket?.emit('combat:prev'); }
  combatEnd() { this.socket?.emit('combat:end'); }
  combatSyncPlayers() { this.socket?.emit('combat:syncPlayers'); }
  combatSettings(opts: { durationSec?: number; autoAdvance?: boolean; autoDelaySec?: number }) { this.socket?.emit('combat:settings', opts); }
  combatPause() { this.socket?.emit('combat:pause'); }
  combatResume() { this.socket?.emit('combat:resume'); }


  isConnected(): boolean { return this.connected; }

  // En src/app/services/socket.service.ts
  combatFinishTurn() {
    this.socket?.emit('combat:finishTurn');
  }
  // === NUEVO: acciones ===
  clearChat(by?: string) {
    this.socket?.emit('chat:clear', { by });
  }
  resetDM() {
    this.socket?.emit('dm:reset');
  }










  
  public emit(event: string, payload?: any): void {
    this.socket?.emit(event, payload);
  }

  /** Pasarela para suscribirse a eventos arbitrarios */
  public on(event: string, handler: (...args: any[]) => void): void {
    this.socket?.on(event, handler);
  }

  /** Anular suscripción */
  public off(event: string, handler?: (...args: any[]) => void): void {
    // handler opcional: si no lo pasas, elimina todos los listeners de ese evento
    if (handler) this.socket?.off(event, handler);
    else this.socket?.off(event);
  }



}
