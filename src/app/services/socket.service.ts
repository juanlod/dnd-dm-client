import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

export interface JoinedPayload { roomId: string; nickname: string; }
export interface ChatPayload { from: string; text: string; ts: number; }
export interface DmPayload   { from: 'DM'; text: string; ts: number; }
export interface RollPayload  { from: string; notation: string; detail: string; rolls: number[]; total: number; ts: number; }

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket?: Socket;
  private connected = false;
  private readonly url = 'http://localhost:3000'; // ajusta si tu backend no corre aquí

  // Eventos de app
  joined$ = new Subject<JoinedPayload>();
  system$ = new Subject<string>();
  chat$   = new Subject<ChatPayload>();
  dm$     = new Subject<DmPayload>();
  roll$   = new Subject<RollPayload>();

  // Señales de conexión (útil para auto-join)
  ready$      = new Subject<void>();       // se emite en cada connect/reconnect
  connected$  = new Subject<boolean>();    // true/false
  connectErr$ = new Subject<any>();        // errores de conexión

  connect(): void {
    if (this.connected && this.socket) return;

    this.socket = io(this.url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.connected$.next(true);
      this.ready$.next(); // listo para emitir eventos como join
    });

    this.socket.on('reconnect', () => {
      this.connected = true;
      this.connected$.next(true);
      this.ready$.next(); // también en cada reconexión
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.connected$.next(false);
    });

    this.socket.io.on('error', (err: any) => this.connectErr$.next(err));
    this.socket.on('connect_error', (err: any) => this.connectErr$.next(err));

    // Canalización de mensajes
    this.socket.on('joined', (data: JoinedPayload) => this.joined$.next(data));
    this.socket.on('system', (msg: string) => this.system$.next(msg));
    this.socket.on('chat', (msg: ChatPayload) => this.chat$.next(msg));
    this.socket.on('dm', (msg: DmPayload) => this.dm$.next(msg));
    this.socket.on('roll', (msg: RollPayload) => this.roll$.next(msg));
  }

  join(roomId: string, name: string) {
    this.socket?.emit('join', { roomId, name });
  }
  sendMessage(text: string, dm = false) {
    this.socket?.emit('chat', { text, dm });
  }
  rollDice(notation: string) {
    this.socket?.emit('roll', { notation });
  }

  on<T = any>(event: string): Observable<T> {
    return new Observable<T>(observer => {
      this.socket?.on(event, (data: T) => observer.next(data));
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
