import type { LedgerBlock } from './types'

const GENESIS = '0'.repeat(64)

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface BlockCheck {
  hashOk: boolean
  linkOk: boolean
}

/**
 * Re-checks the whole chain in the browser:
 *  - sha256(payload) must equal the stored hash
 *  - prev_hash must equal the previous block's hash
 *  - payload must start with "<block_number>|<prev_hash>|" so it can't be swapped
 */
export async function verifyChain(blocks: LedgerBlock[]) {
  const sorted = [...blocks].sort((a, b) => a.block_number - b.block_number)
  const result = new Map<number, BlockCheck>()
  let prev = GENESIS
  for (const b of sorted) {
    const computed = await sha256Hex(b.payload)
    const headerOk = b.payload.startsWith(`${b.block_number}|${b.prev_hash}|`)
    result.set(b.block_number, { hashOk: computed === b.hash && headerOk, linkOk: b.prev_hash === prev })
    prev = b.hash
  }
  return result
}
