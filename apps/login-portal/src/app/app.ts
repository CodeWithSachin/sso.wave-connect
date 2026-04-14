import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
  styles: [':host { display: block; min-height: 100vh; }'],
})
export class App {}
