import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ChatComponent } from './components/chat/chat.component';
import { GeminiChatComponent } from './components/gemini/gemini-chat.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { TrelloBoardComponent } from './components/trello-board/trello-board.component';

const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'chat', component: ChatComponent },
  { path: 'chat/:channelId', component: ChatComponent },
  { path: 'gemini', component: GeminiChatComponent },
  { path: 'calendar', component: CalendarComponent },
  { path: 'trello', component: TrelloBoardComponent },
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
