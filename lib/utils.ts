import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatPhone(phone: string) {
  return phone.startsWith("+") ? phone : `+${phone}`;
}
