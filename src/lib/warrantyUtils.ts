/**
 * Convert warranty days to human readable format in Arabic
 */
export const formatWarrantyDays = (days: number | null | undefined): string => {
  if (!days || days <= 0) return "بدون ضمان";
  
  // Years
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const remainingDays = days % 365;
    const months = Math.floor(remainingDays / 30);
    
    if (years === 1 && months === 0) return "سنة";
    if (years === 2 && months === 0) return "سنتين";
    if (years > 2 && months === 0) return `${years} سنوات`;
    
    if (years === 1) return `سنة و ${formatMonths(months)}`;
    if (years === 2) return `سنتين و ${formatMonths(months)}`;
    return `${years} سنوات و ${formatMonths(months)}`;
  }
  
  // Months
  if (days >= 30) {
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    
    if (remainingDays === 0) return formatMonths(months);
    return `${formatMonths(months)} و ${remainingDays} يوم`;
  }
  
  // Days only
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومين";
  if (days <= 10) return `${days} أيام`;
  return `${days} يوم`;
};

const formatMonths = (months: number): string => {
  if (months === 1) return "شهر";
  if (months === 2) return "شهرين";
  if (months <= 10) return `${months} أشهر`;
  return `${months} شهر`;
};

/**
 * Get warranty badge color class based on duration
 */
export const getWarrantyBadgeClass = (days: number | null | undefined): string => {
  if (!days || days <= 0) return "bg-muted text-muted-foreground";
  if (days >= 365) return "bg-green-500/20 text-green-500";
  if (days >= 30) return "bg-blue-500/20 text-blue-500";
  return "bg-yellow-500/20 text-yellow-500";
};
