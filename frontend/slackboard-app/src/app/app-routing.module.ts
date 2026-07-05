import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { TrelloComponent } from './components/trello/trello.component';

const routes: Routes = [
  { path: '', redirectTo: '/chat', pathMatch: 'full' },
  { path: 'chat', component: ChatComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'trello', component: TrelloComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
