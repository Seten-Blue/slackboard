import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ChatComponent } from './components/chat/chat.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { MessageAreaComponent } from './components/message-area/message-area.component';
import { TrelloComponent } from './components/trello/trello.component';
import { AiChatComponent } from './components/ai-chat/ai-chat.component';
import { PlatformIconComponent } from './components/platform-icon/platform-icon.component';
import { AuthComponent } from './components/auth/auth.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { DiscordLinkModalComponent } from './components/discord-link-modal/discord-link-modal.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { SlackLinkModalComponent } from './components/slack-link-modal/slack-link-modal.component';
import { ProfileSettingsComponent } from './components/profile-settings/profile-settings.component';
import { PollModalComponent } from './components/poll-modal/poll-modal.component';
import { PollRendererComponent } from './components/poll-renderer/poll-renderer.component';
import { ThreadModalComponent } from './components/thread-modal/thread-modal.component';
import { ThreadRendererComponent } from './components/thread-renderer/thread-renderer.component';
import { ThreadPanelComponent } from './components/thread-panel/thread-panel.component';
import { DashboardActivityComponent } from './components/dashboard-activity/dashboard-activity.component';
import { DashboardTrafficComponent } from './components/dashboard-traffic/dashboard-traffic.component';
import { DashboardStatisticsComponent } from './components/dashboard-statistics/dashboard-statistics.component';

@NgModule({
  declarations: [
    AppComponent,
    SidebarComponent,
    ChatComponent,
    DashboardComponent,
    MessageAreaComponent,
    TrelloComponent,
    AiChatComponent,
    PlatformIconComponent,
    AuthComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    DiscordLinkModalComponent,
    SlackLinkModalComponent,
    ProfileSettingsComponent,
    PollModalComponent,
    PollRendererComponent,
    ThreadModalComponent,
    ThreadRendererComponent,
    ThreadPanelComponent,
    DashboardActivityComponent,
    DashboardTrafficComponent,
    DashboardStatisticsComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    NgChartsModule
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
