import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const money = (cents: number, compact = false) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(cents) >= 100000000 ? 'compact' : 'standard',
  }).format(cents / 100);
export const number = (value: number) => new Intl.NumberFormat('en-IE').format(value);
export const utcDate = (value: string) =>
  new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z');
export const dateLabel = (value: string, timezone = 'Europe/Lisbon') =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  }).format(utcDate(value));
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
export const growth = (current: number, previous: number) =>
  previous ? ((current - previous) / previous) * 100 : null;
export function localToday(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function daysBefore(day: string, days: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
