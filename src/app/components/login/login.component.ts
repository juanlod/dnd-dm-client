import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';

// NG-ZORRO
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    NgIf,
    ReactiveFormsModule,
    NzFormModule, NzInputModule, NzButtonModule, NzCheckboxModule,
    NzCardModule, NzTypographyModule, NzGridModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private chat = inject(ChatService);
  private router = inject(Router);

  loading = false;
  generalError = '';

  form = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control('', {
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(24),
        Validators.pattern(/^[\p{L}\p{N}\- _]+$/u)
      ]
    }),
    roomId: this.fb.nonNullable.control('', {
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(40),
        Validators.pattern(/^[a-z0-9\-]+$/)
      ]
    }),
    remember: this.fb.nonNullable.control(true)
  });

  ngOnInit(): void {
    const saved = localStorage.getItem('dnddm.login');
    if (saved) {
      try {
        const { name, roomId } = JSON.parse(saved);
        if (name) this.form.patchValue({ name });
        if (roomId) this.form.patchValue({ roomId });
      } catch {}
    }
  }

  get f() { return this.form.controls; }

  submit(): void {
    this.generalError = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, roomId, remember } = this.form.getRawValue();
    this.loading = true;

    try {
      if (remember) localStorage.setItem('dnddm.login', JSON.stringify({ name, roomId }));
      else localStorage.removeItem('dnddm.login');
    } catch {}

    try {
      this.chat.login(name, roomId); // fija identidad y lanza join
    } catch (e: any) {
      console.warn('[Login] chat.login error:', e);
      this.generalError = e?.message || 'No se pudo iniciar la sesión de chat aún.';
    } finally {
      this.router.navigate(['/mesa'], { replaceUrl: true }); // o '/chat' si esa es tu ruta
      this.loading = false;
    }
  }

  generateRoomId(): void {
    const adjectives = ['bosque', 'abismo', 'bruma', 'roble', 'runa', 'forja', 'draco', 'ebano']; // sin tilde
    const nums = Math.floor(Math.random() * 90) + 10;
    const word = adjectives[Math.floor(Math.random() * adjectives.length)];
    const slug = `${word}-${nums}`;
    this.form.patchValue({ roomId: slug });
  }
}
