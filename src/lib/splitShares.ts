import { SplitType } from '@prisma/client';

import type { SplitShares } from '~/store/addStore';

export type SerializedSplitShares = Record<string, Partial<Record<SplitType, string>>>;

const serializedSplitSharesSchema = (value: unknown): value is SerializedSplitShares => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (participantShares) =>
      participantShares &&
      typeof participantShares === 'object' &&
      !Array.isArray(participantShares) &&
      Object.values(participantShares).every((share) => typeof share === 'string'),
  );
};

export const serializeSplitShares = (splitShares: SplitShares): SerializedSplitShares =>
  Object.fromEntries(
    Object.entries(splitShares).map(([userId, shares]) => [
      userId,
      Object.fromEntries(
        Object.entries(shares).flatMap(([splitType, share]) =>
          share === undefined ? [] : [[splitType, share.toString()]],
        ),
      ),
    ]),
  );

export const deserializeSplitShares = (
  splitShares: unknown,
  splitType: SplitType,
): Record<number, bigint> | undefined => {
  if (!serializedSplitSharesSchema(splitShares)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(splitShares)
      .map(([userId, shares]) => {
        const share = shares[splitType];
        if (share === undefined) {
          return undefined;
        }

        return [Number(userId), BigInt(share)] as const;
      })
      .filter((entry) => entry !== undefined),
  );
};
