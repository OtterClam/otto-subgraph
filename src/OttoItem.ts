import { Address, BigInt, store } from '@graphprotocol/graph-ts'
import { TransferBatch, TransferSingle } from '../generated/OttoItem/OttoItemContract'
import { OTTO } from './Constants'
import { getItemEntity, updateEntity } from './OttoItemHelper'

export function handleTransfer(event: TransferSingle): void {
  transfer(event.params.id, event.params.from, event.params.to, event.params.value, event.block.timestamp)
}

export function handleTransferBatch(event: TransferBatch): void {
  for (let i = 0; i < event.params.ids.length; i++) {
    transfer(event.params.ids[i], event.params.from, event.params.to, event.params.values[i], event.block.timestamp)
  }
}

// function transfer(event: TransferEvent): void {
function transfer(itemId: BigInt, from: Address, to: Address, value: BigInt, timestamp: BigInt): void {
  if (to !== Address.fromString(OTTO)) {
    // if transfer to Otto, handle in Otto Item Equipped handler
    let toEntity = getItemEntity(itemId, to, null)
    updateEntity(toEntity, timestamp)
    toEntity.rootOwner = to
    toEntity.amount += value.toI32()
    toEntity.save()
  }

  if (from !== Address.fromString(OTTO)) {
    // if transfer from Otto, handle in Otto Item Took Off handler
    let fromEntity = getItemEntity(itemId, from, null)
    updateEntity(fromEntity, timestamp)
    fromEntity.amount -= value.toI32()
    if (fromEntity.amount <= 0) {
      store.remove('OttoItem', fromEntity.id)
    } else {
      fromEntity.save()
    }
  }
}
