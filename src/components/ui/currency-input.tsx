import React from 'react';
import { Input, InputProps } from './input';
import { cn } from '~/lib/utils';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';

const CurrencyInput: React.FC<
  Omit<InputProps, 'type' | 'inputMode'> & {
    currency: string;
    strValue: string;
    onValueChange: (v: { strValue?: string; bigIntValue?: bigint }) => void;
    allowNegative?: boolean;
    hideSymbol?: boolean;
  }
> = ({ className, currency, allowNegative, strValue, onValueChange, hideSymbol, ...props }) => {
  const { getCurrencyHelpersCached } = useTranslationWithUtils(undefined);
  const { format, parseToCleanString, toSafeBigInt, sanitizeInput } =
    getCurrencyHelpersCached(currency);

  const onToggleSign = React.useCallback(() => {
    const cleanString = parseToCleanString(strValue, true);
    const nextStrValue = cleanString.startsWith('-')
      ? cleanString.slice(1)
      : '' === cleanString
        ? '-'
        : `-${cleanString}`;
    const bigIntValue = toSafeBigInt(nextStrValue, true);

    onValueChange({ strValue: nextStrValue, bigIntValue });
  }, [onValueChange, parseToCleanString, strValue, toSafeBigInt]);

  return (
    <Input
      className={cn('text-lg placeholder:text-sm', className)}
      inputMode="decimal"
      value={strValue}
      onFocus={() => onValueChange({ strValue: parseToCleanString(strValue, allowNegative) })}
      onBlur={() => {
        const formattedValue = format(strValue, { signed: allowNegative, hideSymbol });
        return onValueChange({ strValue: formattedValue });
      }}
      onChange={(e) => {
        const rawValue = e.target.value;
        const strValue = sanitizeInput(rawValue, allowNegative, true);
        const bigIntValue = toSafeBigInt(strValue, allowNegative);
        onValueChange({ strValue, bigIntValue });
      }}
      leftIcon={
        allowNegative ? (
          <button
            type="button"
            aria-label="Toggle negative amount"
            className="text-muted-foreground hover:text-foreground flex size-5 items-center justify-center text-lg leading-none"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleSign}
          >
            {parseToCleanString(strValue, true).startsWith('-') ? '+' : '-'}
          </button>
        ) : undefined
      }
      {...props}
    />
  );
};

CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };
