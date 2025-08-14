import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-dice-roller',
  standalone: true,
  imports: [FormsModule, NzInputModule, NzButtonModule, NzTypographyModule],
  templateUrl: './dice-roller.component.html',
  styleUrl: './dice-roller.component.scss'
})
export class DiceRollerComponent {
  private chat = inject(ChatService);
  notation = '1d20+0';
  roll() { this.chat.roll(this.notation); }
}
