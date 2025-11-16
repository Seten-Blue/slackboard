import { Component, OnInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit {
  currentChannel: any = null;

  constructor(private chatService: ChatService) {}

  ngOnInit() {
    this.chatService.currentChannel$.subscribe(channel => {
      this.currentChannel = channel;
    });
  }
}
