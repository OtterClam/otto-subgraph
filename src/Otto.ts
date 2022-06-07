import { Address, BigInt, log, store } from '@graphprotocol/graph-ts'
import { OttoContract, Transfer as TransferEvent } from '../generated/Otto/OttoContract'
import { OpenPortal, OttoV2Contract, SummonOtto, TraitsChanged } from '../generated/Otto/OttoV2Contract'
import { ItemEquipped, ItemTookOff, OttoV3Contract } from '../generated/Otto/OttoV3Contract'
import { Otto } from '../generated/schema'
import { OTTO, OTTO_RARITY_SCORE_START_ID, OTTO_V2_BLOCK, OTTO_V3_BLOCK } from './Constants'
import { getItemEntity, updateEntity } from './OttoItemHelper'
import { updateRarityScore } from './RarityScore'
import { parseConstellation } from './utils/Constellation'

let PortalStatus = ['UNOPENED', 'OPENED', 'SUMMONED']

export function handleTransfer(event: TransferEvent): void {
  let tokenId = event.params.tokenId
  let entity = getOttoEntity(tokenId)
  entity.owner = event.params.to
  entity.updateAt = event.block.timestamp
  if (event.block.number < BigInt.fromString(OTTO_V2_BLOCK)) {
    // v1
    let otto = OttoContract.bind(Address.fromString(OTTO))
    let tokenURI = otto.try_tokenURI(tokenId)
    entity.tokenURI = tokenURI.reverted ? '' : tokenURI.value
    entity.portalStatus = PortalStatus[0] // UNOPENED
    entity.mintAt = event.block.timestamp
    entity.canOpenAt = BigInt.fromU64(1649250000)
    entity.summonAt = BigInt.fromI32(0)
    entity.epoch = -1
  } else {
    // v2
    updateV2(entity, tokenId)

    if (event.block.number >= BigInt.fromString(OTTO_V3_BLOCK)) {
      // handle owned items transfer
      let ottoV3 = OttoV3Contract.bind(Address.fromString(OTTO))
      let itemIds = ottoV3.ownedItemsOf(tokenId)
      entity.numericVisibleTraits = ottoV3.numericTraitsOf(tokenId)
      for (let i = 0; i < itemIds.length; i++) {
        let itemId = itemIds[i]
        let itemEntity = getItemEntity(itemId, Address.fromString(OTTO), tokenId)
        itemEntity.rootOwner = entity.owner
        itemEntity.updateAt = event.block.timestamp
        itemEntity.save()
      }
    }
  }
  entity.save()
}

export function handleOpen(event: OpenPortal): void {
  let tokenId = event.params.tokenId_
  let entity = getOttoEntity(tokenId)
  updateV2(entity, tokenId)
  entity.updateAt = event.block.timestamp
  entity.save()
}

export function handleSummon(event: SummonOtto): void {
  let tokenId = event.params.tokenId_
  let entity = getOttoEntity(tokenId)
  updateV2(entity, tokenId)
  entity.updateAt = event.block.timestamp
  entity.save()
}

export function handleTraitsChanged(event: TraitsChanged): void {
  let tokenId = event.params.tokenId_
  let ottoEntity = getOttoEntity(tokenId)
  updateV2(ottoEntity, tokenId)
  ottoEntity.updateAt = event.block.timestamp
  if (tokenId.ge(BigInt.fromString(OTTO_RARITY_SCORE_START_ID))) {
    updateRarityScore(event.params.arr_, ottoEntity, event.block.timestamp)
  }
  if (event.block.number >= BigInt.fromString(OTTO_V3_BLOCK)) {
    let ottoV3 = OttoV3Contract.bind(Address.fromString(OTTO))
    ottoEntity.numericVisibleTraits = ottoV3.numericTraitsOf(tokenId)
  }
  ottoEntity.save()

  log.info('handleTraitsChanged, otto: {}, item count: {}, legendaryBoost: {}', [
    tokenId.toString(),
    ottoEntity.items.length.toString(),
    ottoEntity.legendaryBoost.toString(),
  ])
}

export function handleItemEquipped(event: ItemEquipped): void {
  let ottoId = event.params.ottoId_
  let entity = getOttoEntity(ottoId)
  updateV2(entity, ottoId)
  entity.updateAt = event.block.timestamp

  let itemEntity = getItemEntity(event.params.itemId_, Address.fromString(OTTO), ottoId)
  itemEntity.amount++
  itemEntity.rootOwner = entity.owner
  itemEntity.parentTokenId = ottoId
  updateEntity(itemEntity, event.block.timestamp)
  itemEntity.save()

  let items = entity.items
  items.push(itemEntity.id)
  entity.items = items
  entity.save()
}

export function handleItemTookOff(event: ItemTookOff): void {
  let ottoId = event.params.ottoId_

  let itemEntity = getItemEntity(event.params.itemId_, Address.fromString(OTTO), ottoId)

  let entity = getOttoEntity(ottoId)
  updateV2(entity, ottoId)

  let items = entity.items
  let index = items.indexOf(itemEntity.id)
  items.splice(index, 1)
  entity.items = items
  entity.updateAt = event.block.timestamp
  entity.save()

  log.info('handleItemTookOff, otto: {}, item count: {}', [ottoId.toString(), entity.items.length.toString()])

  store.remove('OttoItem', itemEntity.id)
}

function getOttoEntity(tokenId: BigInt): Otto {
  let id = OTTO + '-' + tokenId.toString()
  let entity = Otto.load(id)
  if (entity == null) {
    entity = new Otto(id)
    entity.tokenId = tokenId
  }
  return entity
}

function updateV2(entity: Otto, tokenId: BigInt): void {
  let ottoV2 = OttoV2Contract.bind(Address.fromString(OTTO))
  entity.tokenURI = ottoV2.tokenURI(tokenId)
  entity.candidates = ottoV2.candidatesOf(tokenId)

  let info = ottoV2.infos(tokenId)
  entity.portalStatus = PortalStatus[info.value5]
  entity.mintAt = info.value0
  entity.canOpenAt = info.value1
  entity.summonAt = info.value2
  // fix overflow when birthday timestamp < 0, wrong date but works
  entity.birthday = info.value3.bitAnd(BigInt.fromU64(0xffffffffffffffff))
  let birthdayDate = new Date(entity.birthday.toI64() * 1000)
  entity.constellation = parseConstellation(birthdayDate)
  entity.legendary = info.value6
  entity.epoch = -1
}
