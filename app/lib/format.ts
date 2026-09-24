export const naira = (value: number | null | undefined) => `₦${Number(value ?? 0).toLocaleString()}`;
