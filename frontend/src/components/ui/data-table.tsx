import { tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { Empty } from './shared';
import type { ReactNode } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
const features = tableFeatures({});
export type TableColumn<T extends object> = ColumnDef<typeof features, T>;
export function DataTable<T extends object>({
  columns,
  data,
  total,
  page = 1,
  pageSize = 20,
  onPage,
  emptyTitle,
  mobileCards,
}: {
  columns: TableColumn<T>[];
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  onPage?: (page: number) => void;
  emptyTitle?: string;
  mobileCards?: ReactNode;
}) {
  const table = useTable({ features, data, columns });
  const isNarrow = useMediaQuery('(max-width: 640px)');
  return (
    <>
      {!data.length ? (
        <Empty
          title={emptyTitle ?? 'No matching records'}
          description="Try changing your filters or adding a new record."
        />
      ) : (
        <>
          {mobileCards && isNarrow ? (
            mobileCards
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => (
                        <th key={header.id}>
                          <table.FlexRender header={header} />
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getAllCells().map((cell) => (
                        <td key={cell.id}>
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {onPage && total !== undefined && (
        <div className="pagination">
          <span>
            Showing {data.length ? (page - 1) * pageSize + 1 : 0}–
            {data.length ? Math.min(page * pageSize, total) : 0} of {total} records
          </span>
          <div>
            {!data.length && page > 1 && (
              <Button variant="outline" size="sm" onClick={() => onPage(1)}>
                Go to first page
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => onPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </Button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => onPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
