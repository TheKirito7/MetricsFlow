import { useSearchParams } from 'react-router-dom';

export function useUrlFilters<const T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  const values = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, searchParams.get(key) ?? fallback]),
  ) as { [K in keyof T]: string };
  function update(patch: Record<string, string | number | undefined>) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: true },
    );
  }
  return { values, update };
}

export function pageNumber(value: string) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
