import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

export interface DbgTableColumn<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => ComponentChildren;
  className?: string;
}

interface DbgTableProps<T> {
  columns: DbgTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  rowClassName?: (row: T, index: number) => string;
  selectedKey?: string | null;
  onRowClick?: (row: T, index: number) => void;
  renderDetail?: (row: T, index: number) => ComponentChildren;
  emptyMessage?: string;
}

export function DbgTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  selectedKey,
  onRowClick,
  renderDetail,
  emptyMessage = 'No rows match filters.',
}: DbgTableProps<T>) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return <p class="dbg-empty-state">{emptyMessage}</p>;
  }

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div class="dbg-table-wrap">
      <table class="dbg-table">
        <thead>
          <tr>
            {renderDetail ? <th style="width:28px" /> : null}
            {columns.map((col) => (
              <th key={col.key} class={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        {rows.map((row, index) => {
          const key = rowKey(row, index);
          const selected = selectedKey === key;
          const expanded = expandedKeys.has(key);
          const extraClass = rowClassName?.(row, index) ?? '';
          return (
            <tbody key={key}>
              <tr
                class={`${selected ? 'dbg-selected' : ''} ${extraClass}`.trim()}
                onClick={() => onRowClick?.(row, index)}
              >
                {renderDetail ? (
                  <td>
                    <button
                      type="button"
                      class="dbg-btn dbg-btn--ghost"
                      style="padding:2px 6px;font-size:10px"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(key);
                      }}
                    >
                      {expanded ? '−' : '+'}
                    </button>
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td key={col.key} class={col.className}>
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
              {renderDetail && expanded ? (
                <tr>
                  <td colSpan={columns.length + 1} class="dbg-detail-cell">
                    {renderDetail(row, index)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export function CollapsibleJson({
  data,
  expanded,
  onToggle,
}: {
  data: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      class={`dbg-json dbg-clickable dbg-json-toggle${expanded ? ' expanded' : ' collapsed'}`}
      onClick={onToggle}
      title="Click to expand/collapse"
    >
      {data}
    </button>
  );
}

export function httpStatusClass(code: number): string {
  if (code >= 500) return 'dbg-status-err';
  if (code >= 400) return 'dbg-status-warn';
  return 'dbg-status-ok';
}
