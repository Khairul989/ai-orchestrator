/**
 * Drop Zone Component - File drag & drop and image paste handler
 */

import {
  Component,
  output,
  signal,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';

@Component({
  selector: 'app-drop-zone',
  standalone: true,
  template: `
    <div
      class="drop-zone"
      [class.drag-over]="isDragOver()"
      (paste)="onPaste($event)"
    >
      @if (isDragOver()) {
        <div class="drop-overlay">
          <div class="drop-content">
            <span class="drop-icon">📎</span>
            <span class="drop-text">Drop files here</span>
          </div>
        </div>
      }

      <ng-content />
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }

    .drop-zone {
      position: relative;
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    .drop-overlay {
      position: absolute;
      inset: 0;
      background: rgba(var(--primary-rgb), 0.1);
      border: 2px dashed var(--primary-color);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      backdrop-filter: blur(2px);
    }

    .drop-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .drop-icon {
      font-size: 32px;
    }

    .drop-text {
      font-size: 16px;
      font-weight: 500;
      color: var(--primary-color);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropZoneComponent {
  filesDropped = output<File[]>();
  imagesPasted = output<File[]>();

  isDragOver = signal(false);

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Check if we're actually leaving the drop zone
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      this.isDragOver.set(false);
    }
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      this.filesDropped.emit(files);
    }
  }

  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          // Create a named file from the blob
          const namedFile = new File(
            [file],
            `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
            { type: file.type }
          );
          imageFiles.push(namedFile);
        }
      }
    }

    if (imageFiles.length > 0) {
      event.preventDefault();
      this.imagesPasted.emit(imageFiles);
    }
  }
}
