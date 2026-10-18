import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Accessible name of the table (visually hidden). */
  caption: string;
};

/**
 * Table from `sm` up; below it every row becomes a card whose cells are labelled by their header, so the page
 * never scrolls sideways on a phone. Roles are repeated explicitly because display:block drops the table
 * semantics in some browsers.
 */
export function DataTable<T>({ columns, rows, rowKey, caption }: DataTableProps<T>) {
  return (
    <table role="table" className="block w-full text-left text-sm sm:table">
      <caption className="sr-only">{caption}</caption>
      <thead role="rowgroup" className="sr-only sm:not-sr-only sm:table-header-group">
        <tr role="row">
          {columns.map((column) => (
            <th
              key={column.key}
              role="columnheader"
              scope="col"
              className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="block space-y-3 sm:table-row-group sm:space-y-0">
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            role="row"
            className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:table-row sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
          >
            {columns.map((column) => (
              <td
                key={column.key}
                role="cell"
                data-label={column.header}
                className="block px-1 py-1 text-slate-800 before:block before:text-xs before:font-semibold before:text-slate-500 before:content-[attr(data-label)] sm:table-cell sm:border-b sm:border-slate-100 sm:px-4 sm:py-3 sm:before:hidden"
              >
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
