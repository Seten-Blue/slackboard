import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FriendshipService {
  private api = `${environment.apiUrl}/friendship`;

  constructor(private http: HttpClient) {}

  search(q: string): Observable<any> {
    return this.http.get(`${this.api}/search?q=${encodeURIComponent(q)}`);
  }

  listFriends(): Observable<any> {
    return this.http.get(`${this.api}/list`);
  }

  listPending(): Observable<any> {
    return this.http.get(`${this.api}/pending`);
  }

  sendRequest(to: string): Observable<any> {
    return this.http.post(`${this.api}/request`, { to });
  }

  acceptRequest(id: string): Observable<any> {
    return this.http.put(`${this.api}/accept/${id}`, {});
  }

  rejectRequest(id: string): Observable<any> {
    return this.http.put(`${this.api}/reject/${id}`, {});
  }

  cancelRequest(id: string): Observable<any> {
    return this.http.delete(`${this.api}/cancel/${id}`);
  }

  removeFriend(id: string): Observable<any> {
    return this.http.delete(`${this.api}/remove/${id}`);
  }
}
