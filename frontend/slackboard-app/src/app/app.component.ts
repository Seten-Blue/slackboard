import { Component, OnInit } from '@angular/core';
import { SocketService } from './services/socket.service';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'SlackBoard';
  showChrome = false;

  constructor(
    private socketService: SocketService,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.socketService.connect();
    this.updateChrome();

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.updateChrome());

    this.authService.currentUser$.subscribe(() => this.updateChrome());
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private updateChrome() {
    this.showChrome = this.authService.isLoggedIn();
  }
}