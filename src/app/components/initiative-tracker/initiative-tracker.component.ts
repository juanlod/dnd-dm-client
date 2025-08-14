import {
    Component,
    OnInit,
    OnDestroy,
    inject,
    signal,
    computed
  } from '@angular/core';
  import { NgFor, NgIf } from '@angular/common';
  import { ChatService } from '../../services/chat.service';
  import { SocketService, CombatUpdate } from '../../services/socket.service';
  
  // Ng Zorro UI (solo lo usado en la plantilla)
  import { NzCardModule } from 'ng-zorro-antd/card';
  import { NzAvatarModule } from 'ng-zorro-antd/avatar';
  import { NzTagModule } from 'ng-zorro-antd/tag';
  import { NzBadgeModule } from 'ng-zorro-antd/badge';
  import { NzTypographyModule } from 'ng-zorro-antd/typography';
  import { NzDividerModule } from 'ng-zorro-antd/divider';
  import { NzProgressModule } from 'ng-zorro-antd/progress';
  import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
  
  type EntryMeta = {
    hp?: number;      // puntos de golpe actuales
    maxHp?: number;   // puntos de golpe máximos
    ac?: number;      // clase de armadura
    conditions?: string[]; // p.ej. ["Envenenado", "Prono"]
    img?: string;     // avatar opcional
    isNPC?: boolean;  // si llega del server
    note?: string;    // nota corta
  };
  
  type Entry = { id: string; name: string; init: number; meta?: EntryMeta };
  
  @Component({
    selector: 'app-initiative-tracker',
    standalone: true,
    imports: [
      NgFor,
      NgIf,
      NzCardModule,
      NzAvatarModule,
      NzTagModule,
      NzBadgeModule,
      NzTypographyModule,
      NzDividerModule,
      NzProgressModule,
      NzToolTipModule
    ],
    templateUrl: './initiative-tracker.component.html',
    styleUrl: './initiative-tracker.component.scss'
  })
  export class InitiativeTrackerComponent implements OnInit, OnDestroy {
    // ====== Servicios (públicos para plantillas estrictas) ======
    public chat = inject(ChatService);
    public socket = inject(SocketService);
  
    // ====== Estado recibido del servidor (autoridad) ======
    public list = signal<Entry[]>([]);
    public round = signal<number>(1);
    public turnIndex = signal<number>(0);
    public durationSec = signal<number>(60);
    public running = signal<boolean>(false);
    public endAt = signal<number | null>(null);
    public autoAdvance = signal<boolean>(true);   // por si el server lo manda
    public autoDelaySec = signal<number>(1);      // por si el server lo manda
  
    // Presencia (para vista previa antes del combate)
    public players = this.chat.playersSig;
  
    // Corrección de reloj (cliente-servidor)
    private offsetMs = 0;
  
    // ====== Derivadas para UI ======
    public inCombat = computed(() => this.list().length > 0);
    public active = computed(() => this.list()[this.turnIndex()] ?? null);
    public nextUp = computed(() => {
      const arr = this.list();
      if (arr.length <= 1) return [];
      const nexts: Entry[] = [];
      for (let k = 1; k <= 3 && k < arr.length; k++) {
        nexts.push(arr[(this.turnIndex() + k) % arr.length]);
      }
      return nexts;
    });
    public headerText = computed(() => {
      const r = this.round();
      const act = this.active()?.name ?? '—';
      return `Iniciativa — Ronda ${r} — Turno: ${act}`;
    });
  
    // ====== Temporizador (dibujado en cliente) ======
    private uiTickId: number | null = null;
    public remainingMs = signal<number>(0);
    public progress = computed(() => {
      const total = Math.max(1, this.durationSec() * 1000);
      return Math.max(0, Math.min(100, Math.round((this.remainingMs() / total) * 100)));
    });
    public timeLeftLabel = computed(() => {
      const ms = Math.max(0, this.remainingMs());
      const s = Math.ceil(ms / 1000);
      const mm = Math.floor(s / 60).toString().padStart(2, '0');
      const ss = (s % 60).toString().padStart(2, '0');
      return `${mm}:${ss}`;
    });
  
    // ====== Mini log (últimos mensajes relevantes) ======
    public miniLog = signal<{ kind: 'dm'|'system'|'roll'; text: string; ts: number }[]>([]);
  
    // Sonido al cambiar turno
    public muted = signal<boolean>(false);
    private lastTurnIndex = -1;
  
    // ====== Ciclo de vida ======
    ngOnInit(): void {
      // 1) Escuchar estado de combate del servidor
      this.socket.combat$.subscribe((st: CombatUpdate) => {
        if (typeof st.serverNow === 'number' && Number.isFinite(st.serverNow)) {
          this.offsetMs = Date.now() - st.serverNow;
        }
        this.list.set(Array.isArray(st.list) ? (st.list as Entry[]) : []);
        this.round.set(typeof st.round === 'number' ? st.round : 1);
        this.turnIndex.set(typeof st.turnIndex === 'number' ? st.turnIndex : 0);
        if (typeof st.durationSec === 'number' && st.durationSec > 0) this.durationSec.set(st.durationSec);
        if (typeof st.running === 'boolean') this.running.set(st.running);
        this.autoAdvance.set(Boolean(st.autoAdvance));
        if (typeof st.autoDelaySec === 'number') this.autoDelaySec.set(st.autoDelaySec);
        this.endAt.set(typeof st.endAt === 'number' ? st.endAt : null);
  
        const idx = typeof st.turnIndex === 'number' ? st.turnIndex : -1;
        if (this.list().length > 0 && idx !== this.lastTurnIndex) {
          if (this.lastTurnIndex !== -1) this.pingTurn();
          this.lastTurnIndex = idx;
        }
        this.tickRemaining();
      });
  
      // 2) Pide estado y presencia al conectar/reconectar
      this.socket.connected$.subscribe(ok => {
        if (ok) {
          this.socket.combatGet();
          this.socket.requestPresence();
        }
      });
      if (this.socket.isConnected()) {
        this.socket.combatGet();
        this.socket.requestPresence();
      }
  
      // 3) Minilog: toma mensajes de ChatService y guarda los últimos relevantes
      this.chat.messages$.subscribe(all => {
        const filtered = all
          .filter(m => m.type === 'system' || m.type === 'dm' || m.type === 'roll')
          .slice(-12)
          .map(m => ({ kind: m.type as any, text: m.text, ts: m.ts }));
        this.miniLog.set(filtered);
      });
  
      // 4) Tick de UI
      this.startUiTick();
    }
  
    ngOnDestroy(): void { this.stopUiTick(); }
  
    // ====== Tick UI (cada ~150ms) ======
    private startUiTick() {
      if (this.uiTickId != null) return;
      const step = () => {
        this.tickRemaining();
        this.uiTickId = window.setTimeout(step, 150);
      };
      this.uiTickId = window.setTimeout(step, 150);
    }
    private stopUiTick() {
      if (this.uiTickId != null) {
        clearTimeout(this.uiTickId);
        this.uiTickId = null;
      }
    }
    private tickRemaining() {
      if (!this.inCombat() || !this.endAt()) {
        this.remainingMs.set(0);
        return;
      }
      const nowCorrected = Date.now() - this.offsetMs;
      const ms = Math.max(0, (this.endAt()! - nowCorrected));
      this.remainingMs.set(ms);
    }
  
    // ====== Sonido ======
    public toggleMute() { this.muted.set(!this.muted()); }
    private pingTurn() {
      this.beep(740, 110);
      setTimeout(() => this.beep(880, 140), 130);
    }
    private beep(hz = 880, ms = 140, type: OscillatorType = 'sine') {
      if (this.muted()) return;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = hz;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
      setTimeout(() => { try { o.stop(); ctx.close(); } catch {} }, ms + 60);
    }
  
    // ====== Helpers de plantilla ======
    public isActive(i: number) { return i === this.turnIndex(); }
    public hpPercent(e: Entry): number | null {
      const hp = e?.meta?.hp, max = e?.meta?.maxHp;
      if (typeof hp !== 'number' || typeof max !== 'number' || max <= 0) return null;
      return Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
    }
    public acLabel(e: Entry): string | null {
      return typeof e?.meta?.ac === 'number' ? `CA ${e.meta.ac}` : null;
    }
    public initials(name: string): string {
      const parts = (name || '').trim().split(/\s+/);
      if (!parts.length) return '?';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    
  }
  