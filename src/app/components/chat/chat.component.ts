import {
  Component, OnDestroy, OnInit, ViewChild, ElementRef,
  signal, computed, inject, HostListener
} from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { Router } from '@angular/router';
import { ChatService, Message } from '../../services/chat.service';

// NG-ZORRO (UI)
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';

// Componentes propios
import { DiceRollerComponent } from '../dice-roller/dice-roller.component';

// Sanitizador para render “markdown” ligero de forma segura
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-chat',
  standalone: true,
  // Al ser standalone, importamos aquí todo lo que el template necesita
  imports: [
    NgFor, NgIf, FormsModule,
    NzInputModule, NzButtonModule, NzTypographyModule,
    NzAvatarModule, NzTagModule, NzPopconfirmModule,
    DiceRollerComponent
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent implements OnInit, OnDestroy {
  // --- Inyecciones de dependencias ---
  private chat = inject(ChatService);       // Orquesta la conexión y la lista de mensajes
  private sanitizer = inject(DomSanitizer); // Para “bypassear” HTML seguro del markdown
  private router = inject(Router);          // Para navegar al salir de la mesa

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

  // ================= Ciclo de vida =================
  ngOnInit() {
    // Nos suscribimos a los mensajes del ChatService
    this.sub = this.chat.messages$.subscribe(ms => {
      // Guardamos si el usuario está “cerca del final” para decidir si autoscrolleamos
      const el = this.logRef?.nativeElement;
      const nearBottom = this.isNearBottom(el);

      // Guardamos el último mensaje para saber desde quién viene
      const last = ms[ms.length - 1];

      // Si el último mensaje es del DM, apagamos “DM escribiendo…”
      if (last && last.type === 'dm') this.stopDmTyping();

      // Actualizamos la lista y las señales (nombre/sala)
      this.messages = ms;
      this.nameSig.set(this.chat.name);
      this.roomSig.set(this.chat.roomId);

      // Autoscroll “inteligente”: baja solo si estabas abajo o si el mensaje es tuyo
      queueMicrotask(() => {
        const fromMe = last?.type !== 'system' && last?.from === this.chat.name;
        if (nearBottom || fromMe) this.scrollToBottom();
      });
    });
  }

  ngOnDestroy() {
    // Evitamos fugas de memoria
    this.sub?.unsubscribe();
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
    const palette = ['c1','c2','c3','c4','c5','c6'];
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

  // Solo para recordar que no interceptamos Enter global: el input ya lo maneja
  @HostListener('window:keydown.enter', ['$event'])
  onEnter(_e: KeyboardEvent) { /* el input ya maneja enter */ }
}
