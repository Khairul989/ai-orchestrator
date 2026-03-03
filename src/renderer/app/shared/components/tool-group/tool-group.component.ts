/**
 * Tool Group Component - Collapsible accordion for grouped tool use/result messages
 *
 * Groups consecutive tool_use and tool_result messages behind an expandable section,
 * reducing visual noise in the conversation stream.
 */

import { Component, input, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { OutputMessage } from '../../../core/state/instance.store';

@Component({
  selector: 'app-tool-group',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="tool-group" [class.expanded]="isExpanded()">
      <button class="tool-group-header" (click)="toggle()">
        <span class="tool-icon">{{ isExpanded() ? '▼' : '▶' }}</span>
        <span class="tool-label">{{ summaryLabel() }}</span>
        <span class="tool-time">
          {{ timeRange() }}
        </span>
        <span class="tool-chevron">{{ isExpanded() ? '−' : '+' }}</span>
      </button>
      @if (isExpanded()) {
        <div class="tool-group-content">
          @for (msg of toolMessages(); track $index) {
            <div class="tool-item" [class]="'tool-item-' + msg.type">
              <div class="tool-item-header">
                <span class="tool-item-type">{{
                  msg.type === 'tool_use' ? 'TOOL' : 'RESULT'
                }}</span>
                <span class="tool-item-name">{{ getToolName(msg) }}</span>
                <span class="tool-item-time">{{
                  msg.timestamp | date: 'HH:mm:ss'
                }}</span>
              </div>
              <pre class="tool-item-content"><code>{{ formatContent(msg) }}</code></pre>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .tool-group {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      font-size: 12px;
    }

    .tool-group-header {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-secondary);
      text-align: left;
      transition: all 0.15s ease;

      &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
    }

    .tool-icon {
      font-size: 10px;
      opacity: 0.6;
      width: 12px;
    }

    .tool-label {
      flex: 1;
      font-weight: 500;
    }

    .tool-time {
      font-family: var(--font-mono);
      font-size: 11px;
      opacity: 0.5;
    }

    .tool-chevron {
      font-size: 16px;
      opacity: 0.5;
      font-weight: 300;
    }

    .tool-group-content {
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: var(--border-color);
    }

    .tool-item {
      background: var(--bg-primary);
      padding: 8px 14px;
    }

    .tool-item-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 11px;
    }

    .tool-item-type {
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
      opacity: 0.6;
    }

    .tool-item-tool_use .tool-item-type {
      color: var(--primary-color, #3b82f6);
    }

    .tool-item-tool_result .tool-item-type {
      color: #10b981;
    }

    .tool-item-name {
      font-weight: 500;
      color: var(--text-primary);
    }

    .tool-item-time {
      margin-left: auto;
      font-family: var(--font-mono);
      opacity: 0.4;
    }

    .tool-item-content {
      margin: 0;
      padding: 6px 8px;
      background: var(--bg-secondary);
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 200px;
      overflow-y: auto;
      color: var(--text-secondary);
    }

    .tool-item-content code {
      font-family: var(--font-mono);
    }

    .tool-group.expanded {
      .tool-group-header {
        color: var(--text-primary);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolGroupComponent {
  toolMessages = input.required<OutputMessage[]>();

  isExpanded = signal(false);

  /**
   * Summary label showing tool names, e.g. "Tool calls: Read, Bash, Edit (6)"
   */
  summaryLabel = computed(() => {
    const msgs = this.toolMessages();
    const toolUses = msgs.filter(m => m.type === 'tool_use');
    const names = toolUses
      .map(m => this.getToolName(m))
      .filter(n => n !== 'Tool Call');

    const uniqueNames = [...new Set(names)];
    const count = msgs.length;

    if (uniqueNames.length === 0) {
      return `${count} tool call${count !== 1 ? 's' : ''}`;
    }

    const nameStr = uniqueNames.length <= 4
      ? uniqueNames.join(', ')
      : uniqueNames.slice(0, 3).join(', ') + ` +${uniqueNames.length - 3} more`;

    return `${nameStr} (${count})`;
  });

  /**
   * Time range of the group
   */
  timeRange = computed(() => {
    const msgs = this.toolMessages();
    if (msgs.length === 0) return '';

    const first = msgs[0];
    const last = msgs[msgs.length - 1];

    const formatTime = (ts: number) => {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    if (first.timestamp === last.timestamp) {
      return formatTime(first.timestamp);
    }

    return `${formatTime(first.timestamp)}–${formatTime(last.timestamp)}`;
  });

  toggle(): void {
    this.isExpanded.update(v => !v);
  }

  getToolName(message: OutputMessage): string {
    if (message.metadata && 'name' in message.metadata) {
      return String(message.metadata['name']);
    }
    return message.type === 'tool_use' ? 'Tool Call' : 'Result';
  }

  formatContent(message: OutputMessage): string {
    if (message.metadata) {
      return JSON.stringify(message.metadata, null, 2);
    }
    return message.content || '';
  }
}
