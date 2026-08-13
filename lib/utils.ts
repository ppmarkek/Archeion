import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRussianCount(value: number, forms: [string, string, string]) {
  const lastTwoDigits = Math.abs(value) % 100;
  const lastDigit = lastTwoDigits % 10;
  const form = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? forms[2]
    : lastDigit === 1
      ? forms[0]
      : lastDigit >= 2 && lastDigit <= 4
        ? forms[1]
        : forms[2];

  return `${value} ${form}`;
}
