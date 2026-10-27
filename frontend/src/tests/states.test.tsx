import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Empty, ErrorState, Loading } from '@/components/ui/shared';
import { DataTable, type TableColumn } from '@/components/ui/data-table';
import { DateRangeControl } from '@/components/ui/date-range';
describe('accessible states', () => {
  it('offers pagination recovery for an empty page URL', async () => {
    const onPage = vi.fn();
    render(
      <DataTable
        columns={[{ accessorKey: 'name', header: 'Customer' }]}
        data={[]}
        total={41}
        page={999}
        onPage={onPage}
      />,
    );
    expect(screen.getByText('No matching records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Go to first page' }));
    expect(onPage).toHaveBeenCalledWith(1);
  });
  it('announces loading', () => {
    render(<Loading label="Calculating revenue…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Calculating revenue…');
  });
  it('offers error recovery', async () => {
    const retry = vi.fn();
    render(<ErrorState error={new Error('Connection lost')} retry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it('explains empty data', () => {
    render(<Empty title="No customers yet" description="Add a customer to begin." />);
    expect(screen.getByRole('heading')).toHaveTextContent('No customers yet');
  });
  it('renders a semantic server-paginated table', async () => {
    const columns: TableColumn<{ name: string }>[] = [{ accessorKey: 'name', header: 'Customer' }];
    const onPage = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[{ name: 'Sofia' }]}
        total={40}
        page={1}
        onPage={onPage}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Customer' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Sofia' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
  it('changes the reporting period with an accessible control', async () => {
    const onChange = vi.fn();
    render(
      <DateRangeControl
        value={{ start_date: '2026-01-01', end_date: '2026-01-31' }}
        timezone="UTC"
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Reporting period'), '7');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
  });
});
