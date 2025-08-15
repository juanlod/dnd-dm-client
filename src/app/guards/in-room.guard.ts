// src/app/guards/in-room.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ChatService } from '../services/chat.service';

export const inRoomGuard: CanActivateFn = () => {
  const chat = inject(ChatService);
  const router = inject(Router);

  // 1) Si ya está en memoria → ok
  if (chat.name && chat.roomId) return true;

  // 2) Intenta restaurar de localStorage → ok
  try {
    const saved = JSON.parse(localStorage.getItem('dnddm.login') || '{}');
    if (saved?.name && saved?.roomId) {
      // Si el servicio expone un setter, úsalo (no asignar a getters!)
      if (typeof (chat as any).setIdentity === 'function') {
        (chat as any).setIdentity(saved.name, saved.roomId);
        if (typeof (chat as any).autoJoinIfPossible === 'function') {
          (chat as any).autoJoinIfPossible();
        }
      }
      return true;
    }
  } catch {}

  // 3) Sin identidad → vuelve al login
  router.navigateByUrl('/login');
  return false;
};
