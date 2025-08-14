import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { App } from './app/app';
import { appConfig } from './app/app.config';

import { NzConfig, provideNzConfig } from 'ng-zorro-antd/core/config';

const ngZorroConfig: NzConfig = {
  button: { nzSize: 'small' },
  tabs:   { nzSize: 'small' },
  table:  { nzSize: 'small' },
  form:   { nzNoColon: true }
};

// Fusiona tu appConfig existente con la config de NG-ZORRO
const finalConfig: ApplicationConfig = mergeApplicationConfig(appConfig, {
  providers: [
    provideNzConfig(ngZorroConfig)
  ]
});

bootstrapApplication(App, finalConfig)
  .catch(err => console.error(err));
