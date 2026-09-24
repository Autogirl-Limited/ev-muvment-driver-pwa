export type Country = { iso: string; code: string; label: string; example: string };

export const countries: Country[] = [
  { iso: "NG", code: "+234", label: "Nigeria", example: "803 123 4567" },
  { iso: "GH", code: "+233", label: "Ghana", example: "24 123 4567" },
  { iso: "KE", code: "+254", label: "Kenya", example: "712 345 678" },
  { iso: "ZA", code: "+27", label: "South Africa", example: "82 123 4567" },
  { iso: "TZ", code: "+255", label: "Tanzania", example: "621 234 567" },
  { iso: "UG", code: "+256", label: "Uganda", example: "712 345 678" },
  { iso: "RW", code: "+250", label: "Rwanda", example: "788 123 456" },
  { iso: "SN", code: "+221", label: "Senegal", example: "77 123 45 67" },
  { iso: "CI", code: "+225", label: "Côte d’Ivoire", example: "07 12 34 56 78" },
  { iso: "EG", code: "+20", label: "Egypt", example: "100 123 4567" },
  { iso: "GB", code: "+44", label: "United Kingdom", example: "7400 123456" },
  { iso: "US", code: "+1", label: "United States", example: "415 555 2671" },
];

export const flagUrl = (iso: string, width: 40 | 80 = 40) =>
  `https://flagcdn.com/w${width}/${iso.toLowerCase()}.png`;
