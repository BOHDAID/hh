// Format date with Arabic text but English numerals
export const formatDateArabic = (
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Use ar-u-nu-latn to get Arabic text with Latin (English) numerals
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  
  return dateObj.toLocaleDateString('ar-u-nu-latn', options || defaultOptions);
};

// Format date with time
export const formatDateTimeArabic = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return dateObj.toLocaleDateString('ar-u-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format short date
export const formatDateShortArabic = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return dateObj.toLocaleDateString('ar-u-nu-latn');
};

// Format number with English numerals (for prices, counts, etc.)
export const formatNumberArabic = (num: number): string => {
  return num.toLocaleString('en-US');
};

// Format currency
export const formatCurrencyArabic = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

// Alias for backward compatibility
export const formatDate = formatDateArabic;
