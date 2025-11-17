import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ChatComponent } from './components/chat/chat.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { MessageAreaComponent } from './components/message-area/message-area.component';
import { CalendarComponent } from './components/calendar/calendar.component'; // ✅ Agregar
import { GeminiChatComponent } from './components/gemini/gemini-chat.component';
import { TrelloBoardComponent } from './components/trello-board/trello-board.component'; // ✅ Agregar

@NgModule({
  declarations: [
    AppComponent,
    SidebarComponent,
    ChatComponent,
    DashboardComponent,
    MessageAreaComponent,
    CalendarComponent,      // ✅ Declarar aquí
    GeminiChatComponent, TrelloBoardComponent     // ✅ Declarar aquí
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    NgChartsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }