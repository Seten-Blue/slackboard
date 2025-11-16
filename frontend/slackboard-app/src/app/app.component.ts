import { Component, OnInit } from '@angular/core';
import { SocketService } from './services/socket.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'SlackBoard';

  constructor(private socketService: SocketService) {}

  ngOnInit() {
    // Conectar al socket al iniciar la app
    this.socketService.connect();
  }
}