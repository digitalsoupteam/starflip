import { encodeAbiParameters, keccak256 } from 'viem';

export function deriveWinningCellsFromRandomViem(rw: bigint, totalCellsQuantity = 25, cellsQuantity = 5) {
  let arr = Array.from({ length: totalCellsQuantity }, (_, i) => i);
  let rnd = rw;
  let remaining = totalCellsQuantity;
  let mask = 0;

  for (let j = 0; j < cellsQuantity; j++) {
    const idx = Number(rnd % BigInt(remaining));
    const val = arr[idx];

    mask |= (1 << val);

    arr[idx] = arr[remaining - 1];
    remaining--;

    const encoded = encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint8' }],
      [rnd, j]
    );
    rnd = BigInt(keccak256(encoded));
  }

  return mask;
}

export function packCellsToMask(cells: number[]): number {
  let mask = 0;
  for (const cell of cells) {
    mask |= 1 << cell;
  }
  return mask;
}
