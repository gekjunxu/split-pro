import { WalletCards } from 'lucide-react';
import React, { useCallback } from 'react';

import { api } from '~/utils/api';

import { NativeSelect, NativeSelectOption } from '../ui/native-select';

export const CardSelector: React.FC<{
  cardId?: number | null;
  onCardPick: (cardId?: number | null) => void;
}> = ({ cardId, onCardPick }) => {
  const cardsQuery = api.card.list.useQuery();

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      onCardPick('' === value ? null : Number(value));
    },
    [onCardPick],
  );

  if (!cardsQuery.data?.length) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <WalletCards className="size-4" />
      <NativeSelect value={cardId?.toString() ?? ''} onChange={onChange} className="max-w-64">
        <NativeSelectOption value="">No payment source</NativeSelectOption>
        {cardsQuery.data.map((card) => (
          <NativeSelectOption key={card.id} value={card.id.toString()}>
            {card.type === 'CASH' ? `${card.name} (cash)` : card.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
};
