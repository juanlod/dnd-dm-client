import { NgFor, NgIf } from '@angular/common';
import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnDestroy, OnInit,
  signal,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { Router } from '@angular/router';
import { ChatService, Message } from '../../services/chat.service';

// NG-ZORRO (UI)
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTypographyModule } from 'ng-zorro-antd/typography';

// Componentes propios
import { DiceRollerComponent } from '../dice-roller/dice-roller.component';

// Sanitizador para render “markdown” ligero de forma segura
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { CombatFxService } from 'src/app/services/combat-fx.service';
import { SocketService } from 'src/app/services/socket.service';
import { CharacterSheetComponent } from '../character-sheet/character-sheet.component';
import { CharacterSummaryComponent } from '../character-summary/character-summary.component';
import { CombatFxOverlayComponent } from '../combat-fx-overlay/combat-fx-overlay.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  // Al ser standalone, importamos aquí todo lo que el template necesita
  imports: [
    NgFor, NgIf, FormsModule,
    NzInputModule, NzButtonModule, NzTypographyModule,
    NzAvatarModule, NzTagModule, NzPopconfirmModule,
    DiceRollerComponent, CharacterSheetComponent, NzDrawerModule, CharacterSummaryComponent, CombatFxOverlayComponent
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent implements OnInit, OnDestroy {

  // --- Inyecciones de dependencias ---
  private chat = inject(ChatService);       // Orquesta la conexión y la lista de mensajes
  private sanitizer = inject(DomSanitizer); // Para “bypassear” HTML seguro del markdown
  private router = inject(Router);          // Para navegar al salir de la mesa
  private socket = inject(SocketService);   // Acciones del DM/mesa
  private fx = inject(CombatFxService);     // Animaciones de combate

  // --- Estado de la vista ---
  messages: Message[] = []; // Lista que pintamos en la log
  messageText = '';         // Valor del input de mensaje
  dmTyping = false;         // Indicador “DM escribiendo…”
  private typingTimer?: any; // Timeout para ocultar el indicador si no llega respuesta

  // Referencia al contenedor del log para hacer autoscroll al final
  @ViewChild('log', { static: false }) logRef?: ElementRef<HTMLDivElement>;

  // --- Señales para cabecera (nombre y sala) ---
  // Se alimentan desde ChatService cada vez que llega “joined” o cambia el estado
  nameSig = signal(this.chat.name);
  roomSig = signal(this.chat.roomId);

  // Texto que mostramos arriba (“Mesa "X" — Nombre”)
  headerText = computed(() => {
    const n = this.nameSig();
    const r = this.roomSig();
    return n && r ? `Mesa "${r}" — ${n}` : 'Mesa';
  });

  // Suscripción al stream de mensajes (para liberar en ngOnDestroy)
  private sub?: Subscription;
  focusSheet = false;

  sheetOpen = false;
  drawerWidth = this.calcDrawerWidth();

  // ================= Ciclo de vida =================
  ngOnInit() {

    console.log('entra')

    this.sub = this.chat.messages$.subscribe(ms => {
      const el = this.logRef?.nativeElement;
      const nearBottom = this.isNearBottom(el);

      const lastIncoming = ms[ms.length - 1];
      if (lastIncoming && lastIncoming.type === 'dm') this.stopDmTyping();

      this.messages = ms;
      this.nameSig.set(this.chat.name);
      this.roomSig.set(this.chat.roomId);

      const newLast = this.messages[this.messages.length - 1];

      queueMicrotask(() => {
        const fromMe = newLast?.type !== 'system' && newLast?.from === this.chat.name;
        if (nearBottom || fromMe) this.scrollToBottom();
      });
    });

    this.socket.on('dm', this.onDmIncoming);
  }



  ngOnDestroy() {
    // Evitamos fugas de memoria
    this.sub?.unsubscribe();
    this.socket.off('dm', this.onDmIncoming);
  }

  // ================= Acciones de UI =================

  /**
   * Enviar el mensaje actual del input.
   * - Si empieza por "@dm", marcamos el indicador de “DM escribiendo…”
   * - Delegamos el envío al ChatService (que emite por socket)
   */
  send() {
    const text = this.messageText.trim();
    if (!text) return;

    // Detectar si es un mensaje al DM (por convención “@dm …”)
    const askDm = text.startsWith('@dm');

    // Enviamos al backend vía ChatService
    this.chat.send(text, askDm);

    // Mostramos “DM escribiendo…” hasta que llegue la respuesta o venza el timeout
    if (askDm) this.startDmTyping();

    // Limpiamos el input
    this.messageText = '';


    // --- Fallback local: dispara FX por el texto enviado mientras llega el eco del servidor
    // --- Fallback local: dispara FX solo si hay palabras clave
    if (!text.startsWith('/fx') && this.matchesAnyFx(text)) {
      this.applyFxForText(text);
    }


  }

  /**
   * Insertar un fragmento en el composer (atajos tipo chips)
   * Mantengo un espacio si hace falta para que no quede “pegado”
   */
  insert(snippet: string) {
    const sep = this.messageText && !this.messageText.endsWith(' ') ? ' ' : '';
    this.messageText = `${this.messageText}${sep}${snippet}`.trimStart();
  }

  /**
   * Salir de la mesa:
   * - Limpia el estado del ChatService y localStorage.
   * - Navega al login.
   * (El botón lanza un Popconfirm antes de ejecutar esto)
   */
  leaveRoom() {
    this.chat.reset();
    this.router.navigateByUrl('/login');
  }

  // ================= Helpers visuales =================

  /** ¿El mensaje es mío? Para alinear burbuja a la derecha y otros estilos */
  isMine(m: Message): boolean {
    return m.type !== 'system' && m.from === this.chat.name;
  }

  /** Inicial para el avatar (primera letra del nombre) */
  initial(name: string): string {
    return (name?.trim()?.[0] || '?').toUpperCase();
  }

  /** Hora “hh:mm” para la metadata de cada mensaje */
  time(ts: number): string {
    return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Color determinista por jugador (persistido en localStorage):
   * - Evita que a cada recarga cambie de color el mismo usuario.
   * - Usamos la suma de charCodes para mapear a una paleta corta.
   */
  colorFor(name: string): string {
    const key = 'dnddm.colors';
    const palette = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
    try {
      const store = JSON.parse(localStorage.getItem(key) || '{}');
      if (!store[name]) {
        const sum = (name || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
        store[name] = palette[sum % palette.length];
        localStorage.setItem(key, JSON.stringify(store));
      }
      return store[name];
    } catch {
      // Si localStorage no está disponible, devolvemos color por suma determinista
      const sum = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return palette[sum % palette.length];
    }
  }

  // ================= Render “markdown” ligero =================

  /**
   * Convierte un subconjunto de markdown a HTML “seguro”:
   * - Listas con “- ”
   * - **negrita**, *cursiva*, `código`
   * - [enlace](https://…)
   * - Mantiene saltos de línea
   *
   * Primero escapamos el texto para evitar inyección,
   * luego reemplazamos marcas por etiquetas y al final
   * marcamos el resultado como SafeHtml.
   */
  render(text: string): SafeHtml {
    if (!text) return '';
    let html = this.escapeHtml(text);

    // listas simples (- ...)
    html = html.replace(/(^|\n)-\s+(.+?)(?=\n|$)/g, (_m, p1, p2) => `${p1}• ${p2}`);

    // negrita, cursiva, código, enlaces
    html = html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // saltos de línea
    html = html.replace(/\n/g, '<br/>');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /** Escapa caracteres peligrosos antes de inyectar HTML */
  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch] as string));
  }

  // ================= Indicador “DM escribiendo…” =================

  /** Enciende el indicador y arma un timeout por si no llega respuesta */
  private startDmTyping() {
    this.dmTyping = true;
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => (this.dmTyping = false), 10_000); // 10s por seguridad
  }

  /** Apaga el indicador y limpia el timeout */
  private stopDmTyping() {
    this.dmTyping = false;
    clearTimeout(this.typingTimer);
  }

  // ================= Autoscroll =================

  /** Lleva el scroll del log al final (último mensaje) */
  private scrollToBottom() {
    const el = this.logRef?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  /**
   * ¿Estás “cerca del final”? Si sí, autoscrolleamos al llegar mensajes nuevos;
   * si no, respetamos que estás leyendo arriba y NO te bajamos de golpe.
   */
  private isNearBottom(el?: HTMLElement | null): boolean {
    if (!el) return true; // si no tenemos ref, asumimos que sí
    const threshold = 80; // distancia en px al borde inferior para considerarlo “cerca”
    return el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold;
  }

  onClearChat() {
    // Limpia local + notifica a toda la sala
    this.chat.clearLocal();
    this.socket.clearChat(/* by */ this.chat['name'] || 'Jugador');
  }

  onResetDM() {
    this.socket.resetDM();
  }

  // Solo para recordar que no interceptamos Enter global: el input ya lo maneja
  @HostListener('window:keydown.enter', ['$event'])
  onEnter(_e: KeyboardEvent) { /* el input ya maneja enter */ }

  toggleFocusSheet() {
    this.focusSheet = !this.focusSheet;
  }

  // Abrir/cerrar
  openSheet() { this.sheetOpen = true; }
  closeSheet() { this.sheetOpen = false; }

  // Ancho sensible a la ventana (ocupamos ~70% con límites)
  calcDrawerWidth(): number {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const min = 560;   // mínimo cómodo para la ficha
    const max = 1100;  // máximo para no tapar todo el chat
    const w = Math.round(vw * 0.7);
    return Math.max(min, Math.min(max, w));
  }

  // Recalcular al redimensionar
  @HostListener('window:resize')
  onResize() {
    this.drawerWidth = this.calcDrawerWidth();
  }

  // ================== FX DE COMBATE (NUEVO) ==================

  /** Compara dos mensajes para saber si son el mismo (evita disparar FX duplicados). */
  private isSameMessage(a?: Message, b?: Message): boolean {
    if (!a || !b) return false;
    const aId = (a as any).id ?? (a as any)._id;
    const bId = (b as any).id ?? (b as any)._id;
    if (aId && bId) return String(aId) === String(bId);

    const aTs = (a as any).ts ?? (a as any).timestamp;
    const bTs = (b as any).ts ?? (b as any).timestamp;
    if (Number.isFinite(aTs) && Number.isFinite(bTs)) return Number(aTs) === Number(bTs);

    return false; // sin identificadores: trátalos como distintos
  }


  /**
   * Aplica un FX según el contenido del mensaje:
   * - Crítico/pifia si detecta d20=20 o d20=1.
   * - Daño/curación si extrae cantidades del texto.
   * - "spell"/"conjuro" para mensajes del DM.
   * - Por defecto: impacto suave.
   */
  private applyFxForMessage(m: Message): void {
    try {
      const center = this.getCenterPercentOverChat();
      const textRaw = this.getMessageText(m) || '';

      const norm = textRaw
        .replace(/<[^>]+>/g, ' ')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s\r\n\t]+/g, ' ')
        .trim();

      // 1) Tiradas (XdY = N)
      if (m.type === 'roll' || /\b\d+\s*d\s*\d+\b/i.test(textRaw)) {
        const parsed = this.parseRoll(textRaw);
        if (parsed) {
          const { faces, total } = parsed;
          if (faces === 20 && total === 20) { this.fx.crit(center); return; }
          if (faces === 20 && total === 1) { this.fx.miss(center); return; }
          this.fx.hit(center); return;
        }
      }

      // 2) Curación (cura 5, curación: 5, heal 5, +5)
      let heal =
        norm.match(/\b(cura|curacion|sanacion|heal|heals)\b[^0-9+\-]{0,12}([+\-]?\d+)/) ||
        norm.match(/\+(\d+)/);
      if (heal) {
        const amt = parseInt(heal[2] ?? heal[1], 10);
        if (Number.isFinite(amt)) { this.fx.heal(amt, center); return; }
      }

      // 3) Daño — soporta “daño 12”, “12 de daño”, “quitas 12 de vida”, “hp -12”, etc.
      let dmg =
        // palabra clave -> número
        norm.match(/\b(dano|damage|dmg)\b[^0-9+\-]{0,12}([+\-]?\d+)/) ||
        // número -> (de)? -> palabra clave
        norm.match(/\b([+\-]?\d+)\b[^a-z0-9]{0,12}(de\s+)?\b(dano|damage|dmg)\b/) ||
        // número -> (de)? -> vida/puntos
        norm.match(/\b([+\-]?\d+)\b[^a-z0-9]{0,12}(de\s+)?\b(vida|hp|pv|ps)\b/) ||
        // atajo: “-12”
        norm.match(/-\s*(\d+)/);

      if (dmg) {
        const amtStr = dmg[2] ?? dmg[1];
        const amt = parseInt(amtStr, 10);
        if (Number.isFinite(amt)) { this.fx.damage(amt, center); return; }
      }

      // 4) Fallo explícito
      if (/\b(miss|fallo|falla|failure)\b/.test(norm)) { this.fx.miss(center); return; }

      // 5) Crítico explícito
      if (/\b(crit|critico|critical)\b/.test(norm)) { this.fx.crit(center); return; }

      // 6) Conjuro/Hechizo (si lo envía el DM)
      if ((m.type === 'dm' || (m as any).author === 'dm') && /\b(spell|conjuro|hechizo)\b/.test(norm)) {
        this.fx.spell(center); return;
      }

      // 7) Sin coincidencias: no disparamos nada
      return;
    } catch (e) {
      console.error('[FX] error in applyFxForMessage:', e);
    }
  }




  /** Extrae el texto de un mensaje tolerando distintas propiedades. */
  private getMessageText(m: Message): string {
    const cands: any[] = [
      (m as any).text,
      (m as any).content,
      (m as any).message,
      (m as any).msg,
      (m as any).body,
      (m as any).value,
      (m as any).payload?.text,
      (m as any).data?.text,
      (m as any).args?.[0],
    ];

    for (const c of cands) {
      if (typeof c === 'string' && c.trim()) return c;
    }

    // Si llega como objeto con texto dentro (p.ej. {type:'damage', amount:12})
    try {
      const s = JSON.stringify(m);
      if (s) return s;
    } catch { /* no-op */ }

    return '';
  }


  /** Coordenadas en % sobre el área del chat (ajusta si prefieres otra zona). */
  private getCenterPercentOverChat(): { x: number; y: number } {
    return { x: 68, y: 70 };
  }

  /** Extrae el primer número del primer grupo capturado si hay match, o null. */
  private findFirstNumber(re: RegExp, s: string): number | null {
    const m = s.match(re);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Intenta parsear tiradas tipo:
   *  - "Tirada: 1d20 = 14"
   *  - "3d6+2 → Total: 14"
   *  - "Roll 2d8-1 = 9"
   * Devuelve faces y total si puede; si no hay total, total = -1.
   */
  private parseRoll(s: string): { faces: number; total: number } | null {
    const dice = s.match(/(\d+)\s*d\s*(\d+)/i);
    const total =
      this.findFirstNumber(/(?:=|total[:\s])\s*(-?\d+)/i, s) ??
      this.findFirstNumber(/\bresult(?:ado)?:?\s*(-?\d+)/i, s) ??
      null;

    if (!dice) return null;
    const faces = parseInt(dice[2], 10);
    if (!Number.isFinite(faces)) return null;

    return { faces, total: total ?? -1 };
  }


  private applyFxForText(text: string): void {
    const center = this.getCenterPercentOverChat();
    const norm = text
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s\r\n\t]+/g, ' ')
      .trim();

    // Tiradas (XdY) -> impacto básico
    if (/\b\d+\s*d\s*\d+\b/i.test(text)) { this.fx.hit(center); return; }

    // Curación
    let heal =
      norm.match(/\b(cura|curacion|sanacion|heal|heals)\b[^0-9+\-]{0,12}([+\-]?\d+)/) ||
      norm.match(/\+(\d+)/);
    if (heal) {
      const amt = parseInt(heal[2] ?? heal[1], 10);
      if (Number.isFinite(amt)) { this.fx.heal(amt, center); return; }
    }

    // Daño — mismos patrones que en applyFxForMessage
    let dmg =
      norm.match(/\b(dano|damage|dmg)\b[^0-9+\-]{0,12}([+\-]?\d+)/) ||
      norm.match(/\b([+\-]?\d+)\b[^a-z0-9]{0,12}(de\s+)?\b(dano|damage|dmg)\b/) ||
      norm.match(/\b([+\-]?\d+)\b[^a-z0-9]{0,12}(de\s+)?\b(vida|hp|pv|ps)\b/) ||
      norm.match(/-\s*(\d+)/);

    if (dmg) {
      const amtStr = dmg[2] ?? dmg[1];
      const amt = parseInt(amtStr, 10);
      if (Number.isFinite(amt)) { this.fx.damage(amt, center); return; }
    }

    // Miss / Crit / Spell
    if (/\b(miss|fallo|falla|failure)\b/.test(norm)) { this.fx.miss(center); return; }
    if (/\b(crit|critico|critical)\b/.test(norm)) { this.fx.crit(center); return; }
    if (/\b(spell|conjuro|hechizo)\b/.test(norm)) { this.fx.spell(center); return; }

    // Sin coincidencias: no disparamos nada
    return;
  }



  private matchesAnyFx(text: string): boolean {
    const norm = text
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s\r\n\t]+/g, ' ')
      .trim();

    // Tiradas
    if (/\b\d+\s*d\s*\d+\b/i.test(text)) return true;

    // Heal
    if (/\b(cura|curacion|sanacion|heal|heals)\b[^0-9+\-]{0,12}[+\-]?\d+/.test(norm)) return true;
    if (/\+\d+/.test(norm)) return true;

    // Daño (ambas direcciones + sinónimos vida) o atajo "-12"
    if (/\b(dano|damage|dmg)\b[^0-9+\-]{0,12}[+\-]?\d+/.test(norm)) return true;
    if (/\b[+\-]?\d+\b[^a-z0-9]{0,12}(de\s+)?\b(dano|damage|dmg|vida|hp|pv|ps)\b/.test(norm)) return true;
    if (/-\s*\d+/.test(norm)) return true;

    // Miss / Crit / Spell
    if (/\b(miss|fallo|falla|failure)\b/.test(norm)) return true;
    if (/\b(crit|critico|critical)\b/.test(norm)) return true;
    if (/\b(spell|conjuro|hechizo)\b/.test(norm)) return true;

    return false;
  }


  private onDmIncoming = (payload: { from: 'DM'; text: string; ts: number }) => {
    // Dispara FX inmediatamente con el texto del DM
    this.applyFxForMessage({
      type: 'dm',
      from: payload.from,
      text: payload.text,
      ts: payload.ts
    } as Message);
  };

}
