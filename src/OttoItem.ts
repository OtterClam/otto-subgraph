import { Address, store } from '@graphprotocol/graph-ts'
import { TransferSingle } from '../generated/OttoItem/OttoItemContract'
import { OTTO } from './Constants'
import { getItemEntity, updateEntity } from './OttoItemHelper'

export function handleTransfer(event: TransferSingle): void {
  let itemId = event.params.id

  if (event.params.to !== Address.fromString(OTTO)) {
    // if transfer to Otto, handle in Otto Item Equipped handler
    let toEntity = getItemEntity(itemId, event.params.to, null)
    updateEntity(toEntity, event.block.timestamp)
    toEntity.rootOwner = event.params.to
    toEntity.amount++
    toEntity.save()
  }

  if (event.params.from !== Address.fromString(OTTO)) {
    // if transfer from Otto, handle in Otto Item Took Off handler
    let fromEntity = getItemEntity(itemId, event.params.from, null)
    updateEntity(fromEntity, event.block.timestamp)
    fromEntity.amount--
    if (fromEntity.amount <= 0) {
      store.remove('OttoItem', fromEntity.id)
    } else {
      fromEntity.save()
    }
  }
}
