import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts'
import { OttoItemContract } from '../generated/OttoItem/OttoItemContract'
import { OttoItem } from '../generated/schema'
import { OTTO_ITEM } from './Constants'

export function getItemEntity(itemId: BigInt, owner: Bytes, ottoId: BigInt | null): OttoItem {
  let id = OTTO_ITEM + '-' + itemId.toString() + '-' + owner.toHexString()
  if (ottoId) {
    id += '-' + ottoId.toString()
  }
  let entity = OttoItem.load(id)
  if (entity == null) {
    entity = new OttoItem(id)
    entity.tokenId = itemId
    entity.tokenURI = ''
    entity.wearable = false
    entity.slot = 0
    entity.rootOwner = owner
    entity.owner = owner
    entity.parentTokenId = ottoId
    entity.amount = 0
    entity.updateAt = BigInt.zero()
    entity.createdAt = BigInt.zero()
  }
  return entity
}

export function updateEntity(entity: OttoItem, timestamp: BigInt): void {
  let itemId = entity.tokenId
  let item = OttoItemContract.bind(Address.fromString(OTTO_ITEM))
  entity.tokenURI = item.uri(itemId) || ''
  entity.wearable = item.wearable(itemId)
  let decoded = item.decode(itemId)
  entity.slot = decoded.value0
  entity.updateAt = timestamp
}
