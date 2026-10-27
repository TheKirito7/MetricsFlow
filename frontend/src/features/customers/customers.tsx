import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowDownUp, ArrowUpRight, Plus, Search, Users } from 'lucide-react';
import { api, params } from '@/lib/api';
import { dateLabel, initials, number } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { useDebounce } from '@/hooks/use-debounce';
import { pageNumber, useUrlFilters } from '@/hooks/use-url-filters';
import type { Customer, Page } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, Loading, PageHeading } from '@/components/ui/shared';
import { DataTable, type TableColumn } from '@/components/ui/data-table';
import { CustomerForm } from './customer-form';
export default function Customers() {
  const { data: me } = useSession();
  const { values, update } = useUrlFilters({
    search: '',
    status: '',
    sort: 'created_at',
    order: 'desc',
    page: '1',
  });
  const { search, status, sort, order } = values;
  const page = pageNumber(values.page);
  const setSearch = (search: string) => update({ search, page: 1 });
  const setStatus = (status: string) => update({ status, page: 1 });
  const setSort = (sort: string) => update({ sort, page: 1 });
  const setOrder = (order: string) => update({ order, page: 1 });
  const setPage = (page: number) => update({ page });
  const debounced = useDebounce(search);
  const [create, setCreate] = useState(false);
  const query = useQuery({
    queryKey: ['customers', { search: debounced, status, sort, order, page }],
    queryFn: () =>
      api.get<Page<Customer>>(
        '/customers' + params({ search: debounced, status, sort, order, page }),
      ),
  });
  const timezone = me?.organization.timezone;
  const columns = useMemo<TableColumn<Customer>[]>(
    () => [
      {
        id: 'name',
        header: 'Customer',
        cell: ({ row }) => (
          <Link className="person" to={'/customers/' + row.original.id}>
            <span className="avatar">{initials(row.original.name)}</span>
            <div>
              <strong>{row.original.name}</strong>
              <small>{row.original.email}</small>
            </div>
          </Link>
        ),
      },
      {
        accessorKey: 'company',
        header: 'Company',
        cell: ({ row }) => <span>{row.original.company || '—'}</span>,
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <Badge status={row.original.status} /> },
      {
        id: 'created',
        header: 'Date added',
        cell: ({ row }) => (
          <span className="muted">{dateLabel(row.original.created_at, timezone)}</span>
        ),
      },
      {
        id: 'action',
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <Button asChild size="icon" variant="ghost">
            <Link to={'/customers/' + row.original.id} aria-label={'View ' + row.original.name}>
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        ),
      },
    ],
    [timezone],
  );
  return (
    <>
      <PageHeading
        eyebrow="RELATIONSHIPS THAT MATTER"
        title="Customers"
        description="Every customer, every connection, all in one place."
        actions={
          me?.role === 'admin' &&
          !me.read_only_demo && (
            <Button onClick={() => setCreate(true)}>
              <Plus size={16} />
              Add customer
            </Button>
          )
        }
      />
      <section className="panel">
        <div className="list-title">
          <h2>
            <Users size={18} />
            Customer directory{' '}
            <span className="count-badge">{query.data ? number(query.data.total) : '…'}</span>
          </h2>
          <span className="muted">Your growing community</span>
        </div>
        <div className="toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search customers"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </div>
          <div className="toolbar-controls">
            <label className="sr-only" htmlFor="customer-filter">
              Customer status
            </label>
            <select
              id="customer-filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <label className="sr-only" htmlFor="customer-sort">
              Sort customers
            </label>
            <select
              id="customer-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
              }}
            >
              <option value="created_at">Date added</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              aria-label={'Sort ' + (order === 'asc' ? 'descending' : 'ascending')}
              onClick={() => {
                setOrder(order === 'asc' ? 'desc' : 'asc');
              }}
            >
              <ArrowDownUp size={16} />
            </Button>
          </div>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={query.data.items}
            total={query.data.total}
            page={page}
            onPage={setPage}
          />
        )}
      </section>
      <p className="page-note">
        Archived customers stay connected to their subscription and transaction history.
      </p>
      {create && <CustomerForm onClose={() => setCreate(false)} />}
    </>
  );
}
