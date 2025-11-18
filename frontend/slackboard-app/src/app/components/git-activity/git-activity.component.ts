import { Component, OnInit } from '@angular/core';

interface FolderActivity {
  folder: string;
  lastAuthor: string;
  lastDate: string;
}

@Component({
  selector: 'app-git-activity',
  templateUrl: './git-activity.component.html',
  styleUrls: ['./git-activity.component.scss']
})
export class GitActivityComponent implements OnInit {
  activities: FolderActivity[] = [];

  ngOnInit() {
    // Aquí deberías cargar los datos reales desde el backend o un archivo generado
    this.activities = [
      { folder: 'backend', lastAuthor: 'Juan Alvarez', lastDate: '2025-11-16 18:00' },
      { folder: 'frontend', lastAuthor: 'Ana Torres', lastDate: '2025-11-16 17:30' },
      { folder: 'docker-compose.yml', lastAuthor: 'Carlos Ruiz', lastDate: '2025-11-15 20:10' },
    ];
  }
}
