import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ChatService } from '../services/chat.service';

export const inRoomGuard: CanActivateFn = () => {
  const chat = inject(ChatService);
  const router = inject(Router);
  if (chat.name && chat.roomId) return true;
  router.navigateByUrl('/login');
  return false;
};
