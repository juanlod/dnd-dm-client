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
  /**
   * Fuente de la verdad del log de mensajes.
   * Usamos BehaviorSubject para poder:
   *  - leer el valor actual (._value / .value)
   *  - emitir nuevos arrays (next)
   *  - exponer un Observable solo-lectura a los componentes.
   */
  private _messages = new BehaviorSubject<Message[]>([]);
  /** Stream solo-lectura para los componentes (sin .next disponible). */
  messages$ = this._messages.asObservable();

  /** Identidad actual de la sesión (sala y apodo asignado por el servidor). */
  private _roomId = '';
  private _name = '';
  get roomId() { return this._roomId; }
  get name() { return this._name; }

  /**
   * Señal con la presencia en mesa (jugadores conectados).
   * La mantenemos ordenada alfabéticamente para UI estable.
   */
  playersSig = signal<RoomPlayer[]>([]);

  /** Referencias a suscripciones abiertas para poder limpiarlas si hiciera falta. */
  private subs: Subscription[] = [];
  
  constructor(private socket: SocketService, private router: Router) {
    // Abre conexión del cliente Socket.IO (idempotente si ya está conectando/conectado).
    this.socket.connect();

    // === Suscripciones a eventos del socket (alimentan el chat y presencia) ===
    this.subs.push(
      // Al unirse a una sala, actualizamos identidad local y navegamos a /mesa.
      this.socket.joined$.subscribe(({ roomId, nickname }) => {
        this._roomId = roomId;
        this._name = nickname;
        this.push({
          from: 'System',
          text: `Conectado a "${roomId}" como ${nickname}`,
          type: 'system',
          ts: Date.now()
        });

        // Si el usuario cayó en / (login) pero ya está dentro, redirige a la mesa.
        if (!location.hash.includes('/mesa') && !location.pathname.includes('/mesa')) {
          this.router.navigateByUrl('/mesa');
        }
      }),

      // Mensajes de sistema (anuncios del servidor).
      this.socket.system$.subscribe(text =>
        this.push({ from: 'System', text, type: 'system', ts: Date.now() })
      ),

      // Mensajes de usuarios normales.
      this.socket.chat$.subscribe((m: ChatPayload) =>
        this.push({ from: m.from, text: m.text, type: 'user', ts: m.ts })
      ),

      // Respuestas del DM (IA).
      this.socket.dm$.subscribe((m: DmPayload) =>
        this.push({ from: 'DM', text: m.text, type: 'dm', ts: m.ts })
      ),

      // Publicación de tiradas.
      this.socket.roll$.subscribe(({ from, detail, rolls, total, ts }) => {
        const t = `🎲 ${detail} → [${rolls.join(', ')}] = ${total}`;
        this.push({ from, text: t, type: 'roll', ts });
      }),

      // Presencia/pizarra de jugadores conectados (ordenamos por nombre).
      this.socket.players$.subscribe(arr => {
        const sorted = [...arr].sort((a, b) => a.name.localeCompare(b.name));
        this.playersSig.set(sorted);
      })
    );

    // === Reunirse automáticamente si hay login guardado (autologin/rejoin) ===
    const saved = this.readSavedLogin();
    if (saved?.name && saved?.roomId) {
      // Si ya hay socket conectado, une directamente.
      if (this.socket.isConnected()) this.socket.join(saved.roomId, saved.name);

      // Si no, espera al evento "ready" del socket para unirte.
      this.subs.push(
        this.socket.ready$.subscribe(() => {
          const again = this.readSavedLogin();
          if (again?.name && again?.roomId) this.socket.join(again.roomId, again.name);
        })
      );
    }

    // === Borrado remoto del chat (ordenado por el servidor) ===
    // Cuando llega 'chat:cleared', vaciamos la lista local y dejamos una marca de sistema.
    this.socket.chatCleared$.subscribe(({ by /*, ts*/ }) => {
      this._messages.next([]);
      this.addSystem(`🧹 ${by} vació el chat aquí.`);
    });
  }

  // ---------------------------------------------------------------------------
  // API usada por componentes (login, envío, tiradas, anuncios, reset de sesión)
  // ---------------------------------------------------------------------------

  /**
   * Inicia sesión en una sala (guarda en localStorage y solicita "join" al servidor).
   */
  login(name: string, roomId: string) {
    console.log('llega')
    if (!name?.trim() || !roomId?.trim()) return;
    this.saveLogin(name.trim(), roomId.trim());
    if (this.socket.isConnected()) this.socket.join(roomId.trim(), name.trim());
  }

  /**
   * Envía un mensaje. Si askDm=true o mensaje inicia por @dm, el servidor pedirá respuesta al DM.
   */
  send(text: string, askDm: boolean) {
    if (!text.trim()) return;
    this.socket.sendMessage(text.trim(), askDm);
  }

  /** Envía una tirada (notación tipo "2d6+3"). */
  roll(notation: string) {
    if (!notation.trim()) return;
    this.socket.rollDice(notation.trim());
  }

  /** Publica un anuncio de sistema (visible para todos). */
  announce(text: string) {
    if (!text?.trim()) return;
    this.socket.announce(text.trim());
  }

  /**
   * Resetea estado local (no toca servidor):
   * - borra mensajes locales
   * - limpia identidad y presencia local
   * - elimina credenciales guardadas
   */
  reset() {
    this._messages.next([]);
    this._name = '';
    this._roomId = '';
    this.playersSig.set([]);
    localStorage.removeItem(LS_LOGIN_KEY);
  }

  // ---------------------------------------------------------------------------
  // Utilidades internas
  // ---------------------------------------------------------------------------

  /** Empuja un mensaje al buffer (con recorte para evitar crecimiento infinito). */
  private push(m: Message) {
    const v = this._messages.value; // referencia actual
    v.push(m);
    // Mantén hasta 500 mensajes; si se pasa, recorta 100 del inicio (ventana deslizante).
    if (v.length > 500) v.splice(0, 100);
    // Emite un nuevo array para disparar change detection.
    this._messages.next([...v]);
  }

  /** Guarda login en localStorage (para rejoin). */
  private saveLogin(name: string, roomId: string) {
    try {
      localStorage.setItem(LS_LOGIN_KEY, JSON.stringify({ name, roomId }));
    } catch {
      /* ignore storage errors (modo incógnito/capacidad) */
    }
  }

  /** Lee login guardado de localStorage (o null si no hay/está corrupto). */
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

  /** Inserta una línea de sistema localmente (no enviada al servidor). */
  addSystem(text: string) {
    const cur = this._messages.value.slice();
    cur.push({ type: 'system', text, ts: Date.now() });
    this._messages.next(cur);
  }

  /** Limpia el log local (no notifica al resto). */
  clearLocal() {
    this._messages.next([]);
  }
}
