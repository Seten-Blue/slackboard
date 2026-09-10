import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authService.token;
    if (token) {
      req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        const isAuthCall =
          req.url.includes('/auth/login') ||
          req.url.includes('/auth/register') ||
          req.url.includes('/auth/google');

        // Un 401 de una integracion (Slack/Discord/Trello/WhatsApp) no significa
        // que la sesion de SlackBoard este vencida: es un error interno de la
        // integracion (p. ej. token externo revocado). Desloguear aca dejaba al
        // usuario tirado en el login al intentar sincronizar.
        const isIntegrationCall =
          req.url.includes('/api/slack') ||
          req.url.includes('/api/discord') ||
          req.url.includes('/api/trello') ||
          req.url.includes('/api/whatsapp');

        // Si la sesion guardada ya no es valida (token vencido/revocado o el
        // usuario fue eliminado), se cierra y se envia al login en lugar de
        // quedar atrapado viendo "Token invalido o expirado".
        const staleSession =
          error.status === 401 ||
          (error.status === 404 && req.url.includes('/auth/me'));

        if (staleSession && !isAuthCall && !isIntegrationCall && this.authService.isLoggedIn()) {
          this.authService.logout();
          this.router.navigate(['/login']);
        }

        return throwError(() => error);
      })
    );
  }
}