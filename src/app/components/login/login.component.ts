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
        Validators.pattern(/^[\p{L}\p{N}\- _]+$/u) // letras, números, guion, subrayado y espacio
      ]
    }),
    roomId: this.fb.nonNullable.control('', {
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(40),
        Validators.pattern(/^[a-z0-9\-]+$/) // slug: minúsculas, números y guion
      ]
    }),
    remember: this.fb.nonNullable.control(true)
  });

  ngOnInit(): void {
    // Cargar última sesión si existe
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
  
    // Guarda/limpia recordatorio (no bloquea)
    try {
      if (remember) localStorage.setItem('dnddm.login', JSON.stringify({ name, roomId }));
      else localStorage.removeItem('dnddm.login');
    } catch {}
  
    try {
      // Cualquier error aquí NO debe impedir navegar
      this.chat.login(name, roomId);
    } catch (e: any) {
      console.warn('[Login] chat.login error:', e);
      this.generalError = e?.message || 'No se pudo iniciar la sesión de chat aún.';
    } finally {
      // NAVEGA SIEMPRE (ajusta la ruta si tu path real no es /chat)
      this.router.navigate(['/mesa'], { replaceUrl: true });
      this.loading = false;
    }
  }
  
  
  generateRoomId(): void {
    // Generador simple de slug legible
    const adjectives = ['bosque', 'abismo', 'bruma', 'roble', 'runa', 'forja', 'draco', 'ébano'];
    const nums = Math.floor(Math.random() * 90) + 10; // 10-99
    const word = adjectives[Math.floor(Math.random() * adjectives.length)];
    const slug = `${word}-${nums}`;
    this.form.patchValue({ roomId: slug });
  }
}
