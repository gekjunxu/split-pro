import { SplitType } from '@prisma/client';

import { deserializeSplitShares, serializeSplitShares } from '~/lib/splitShares';
import { initSplitShares, type SplitShares } from '~/store/addStore';

describe('split share persistence', () => {
  it('serializes and restores share split values as bigint inputs', () => {
    const splitShares: SplitShares = {
      1: { ...initSplitShares(), [SplitType.SHARE]: 20000n },
      2: { ...initSplitShares(), [SplitType.SHARE]: 10000n },
    };

    const serialized = serializeSplitShares(splitShares);
    const deserialized = deserializeSplitShares(serialized, SplitType.SHARE);

    expect(serialized).toEqual({
      1: { [SplitType.SHARE]: '20000' },
      2: { [SplitType.SHARE]: '10000' },
    });
    expect(deserialized).toEqual({
      1: 20000n,
      2: 10000n,
    });
  });

  it('ignores malformed persisted split shares', () => {
    expect(deserializeSplitShares({ 1: { [SplitType.SHARE]: 20000 } }, SplitType.SHARE)).toBe(
      undefined,
    );
  });
});
