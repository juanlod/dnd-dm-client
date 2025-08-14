import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ChatComponent } from './components/chat/chat.component';
import { inRoomGuard } from './guards/in-room.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  { path: 'mesa', component: ChatComponent, canActivate: [inRoomGuard] },
  { path: '**', redirectTo: 'login' }
];
