import { Address, BigInt, Bytes, log, store } from '@graphprotocol/graph-ts'
import { OttoContract, Transfer as TransferEvent } from '../generated/Otto/OttoContract'
import { OpenPortal, OttoV2Contract, SummonOtto, TraitsChanged } from '../generated/Otto/OttoV2Contract'
import {
  BaseAttributesChanged,
  EpochBoostsChanged,
  ItemEquipped,
  ItemTookOff,
  OttoV3Contract,
} from '../generated/Otto/OttoV3Contract'
import { ApIncreased, ExpIncreased, LevelUp, OttoV4Contract } from '../generated/Otto/OttoV4Contract'
import { Otto } from '../generated/schema'
import { ADVENTURE, OTTO, OTTO_RARITY_SCORE_START_ID, OTTO_V2_BLOCK, OTTO_V3_BLOCK, OTTO_V4_BLOCK } from './Constants'
import { getItemEntity, updateEntity } from './OttoItemHelper'
import {
  calculateOttoRarityScore,
  createSnapshotsForAllOttos,
  toEpoch,
  updateOrCreateEpoch,
  updateOrCreateOttoSnapshot,
  updateRarityScore,
} from './RarityScore'
import { parseConstellation } from './utils/Constellation'

let PortalStatus = ['UNOPENED', 'OPENED', 'SUMMONED']

export function handleTransfer(event: TransferEvent): void {
  let tokenId = event.params.tokenId
  let entity = getOttoEntity(tokenId)
  if (event.params.to != Address.fromString(ADVENTURE)) {
    entity.owner = event.params.to
  }
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
      let ottoV3 = OttoV3Contract.bind(Address.fromString(OTTO))
      entity.numericVisibleTraits = ottoV3.numericTraitsOf(tokenId)

      // handle owned items transfer
      let itemIds = ottoV3.ownedItemsOf(tokenId)
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
  const epochCreated = updateOrCreateEpoch(event.block.timestamp)

  let tokenId = event.params.tokenId_
  let ottoEntity = getOttoEntity(tokenId)
  ottoEntity.updateAt = event.block.timestamp
  if (tokenId.ge(BigInt.fromString(OTTO_RARITY_SCORE_START_ID))) {
    updateRarityScore(event.params.arr_, ottoEntity, event.block.timestamp)
  }
  if (event.block.number >= BigInt.fromString(OTTO_V3_BLOCK)) {
    let ottoV3 = OttoV3Contract.bind(Address.fromString(OTTO))
    ottoEntity.numericVisibleTraits = ottoV3.numericTraitsOf(tokenId)
    ottoEntity.numericRawTraits = ottoV3.infos(tokenId).getTraits()
  }
  ottoEntity.save()

  if (epochCreated) {
    createSnapshotsForAllOttos(event.block.timestamp)
  }
  // log.info('handleTraitsChanged, otto: {}, item count: {}, legendaryBoost: {}', [
  //   tokenId.toString(),
  //   ottoEntity.items.length.toString(),
  //   ottoEntity.legendaryBoost.toString(),
  // ])
}

export function handleEpochBoostChanged(event: EpochBoostsChanged): void {
  const epochCreated = updateOrCreateEpoch(event.block.timestamp)

  let tokenId = event.params.ottoId_
  let ottoEntity = getOttoEntity(tokenId)
  ottoEntity.baseAttributes = event.params.attrs_
  ottoEntity.epochRarityBoost = event.params.attrs_[7]
  ottoEntity.diceCount = event.params.attrs_[8]
  ottoEntity.updateAt = event.block.timestamp
  calculateOttoRarityScore(ottoEntity, event.params.epoch_.toI32())
  let epoch = toEpoch(event.block.timestamp)
  if (epoch === event.params.epoch_.toI32()) {
    ottoEntity.save()
  }
  updateOrCreateOttoSnapshot(ottoEntity, event.params.epoch_.toI32())

  if (epochCreated) {
    createSnapshotsForAllOttos(event.block.timestamp)
  }
}

export function handleBaseAttributesChanged(event: BaseAttributesChanged): void {
  const epochCreated = updateOrCreateEpoch(event.block.timestamp)
  const ottoV4 = OttoV4Contract.bind(Address.fromString(OTTO))
  let tokenId = event.params.ottoId_
  let ottoEntity = getOttoEntity(tokenId)
  ottoEntity.baseAttributes = event.params.attrs_
  ottoEntity.updateAt = event.block.timestamp
  if (event.block.number > BigInt.fromString(OTTO_V4_BLOCK)) {
    ottoEntity.attributePoints = ottoV4.infos(tokenId).getAttributePoints().toI32()
  }

  if (ottoEntity.baseRarityBoost != event.params.attrs_[7]) {
    ottoEntity.baseRarityBoost = event.params.attrs_[7]
    let epoch = toEpoch(event.block.timestamp)
    calculateOttoRarityScore(ottoEntity, epoch)
    updateOrCreateOttoSnapshot(ottoEntity, epoch)
  }

  ottoEntity.save()

  if (epochCreated) {
    createSnapshotsForAllOttos(event.block.timestamp)
  }
}

export function handleItemEquipped(event: ItemEquipped): void {
  let ottoId = event.params.ottoId_
  let otto = getOttoEntity(ottoId)
  otto.updateAt = event.block.timestamp

  let itemEntity = getItemEntity(event.params.itemId_, Address.fromString(OTTO), ottoId)
  itemEntity.amount++
  itemEntity.rootOwner = otto.owner
  itemEntity.parentTokenId = ottoId
  updateEntity(itemEntity, event.block.timestamp)
  itemEntity.save()

  let items = otto.items
  items.push(itemEntity.id)
  otto.items = items
  otto.save()
}

export function handleItemTookOff(event: ItemTookOff): void {
  let ottoId = event.params.ottoId_

  let itemEntity = getItemEntity(event.params.itemId_, Address.fromString(OTTO), ottoId)

  let entity = getOttoEntity(ottoId)
  let items = entity.items
  let index = items.indexOf(itemEntity.id)
  items.splice(index, 1)
  entity.items = items
  entity.updateAt = event.block.timestamp
  entity.save()

  log.info('handleItemTookOff, otto: {}, item count: {}', [ottoId.toString(), entity.items.length.toString()])

  store.remove('OttoItem', itemEntity.id)
}

export function handleExpIncreased(event: ExpIncreased): void {
  let ottoEntity = getOttoEntity(event.params.ottoId_)
  ottoEntity.exp = event.params.total_
  ottoEntity.updateAt = event.block.timestamp
  ottoEntity.save()
}

export function handleLevelUp(event: LevelUp): void {
  let ottoEntity = getOttoEntity(event.params.ottoId_)
  ottoEntity.level = event.params.toLv_.toI32()
  ottoEntity.exp = event.params.toExp_
  ottoEntity.attributePoints = event.params.attributePoints_.toI32()
  ottoEntity.lastLevelUpAt = event.block.timestamp
  ottoEntity.nextLevelExp = event.params.toNextLevelExp_
  ottoEntity.updateAt = event.block.timestamp
  ottoEntity.save()
}

export function handleApIncreased(event: ApIncreased): void {
  const epochCreated = updateOrCreateEpoch(event.block.timestamp)

  let ottoEntity = getOttoEntity(event.params.ottoId_)
  ottoEntity.ap += event.params.inc_.toI32()
  ottoEntity.apUpdatedAt = event.block.timestamp
  ottoEntity.updateAt = event.block.timestamp
  ottoEntity.save()

  if (epochCreated) {
    createSnapshotsForAllOttos(event.block.timestamp)
  }
}

export function getOttoEntityId(tokenId: BigInt): string {
  return OTTO + '-' + tokenId.toString()
}

export function getOttoEntity(tokenId: BigInt): Otto {
  let id = getOttoEntityId(tokenId)
  let entity = Otto.load(id)
  if (entity == null) {
    entity = new Otto(id)
    entity.tokenId = tokenId
    entity.epoch = -1
    entity.traits = []
    entity.owner = Bytes.empty()
    entity.tokenURI = ''
    entity.candidates = []
    entity.portalStatus = ''
    entity.legendary = false
    entity.legendaryBoost = 0
    entity.brs = 0
    entity.rrs = 0
    entity.rarityScore = 0
    entity.canOpenAt = BigInt.zero()
    entity.summonAt = BigInt.zero()
    entity.epoch = -1
    entity.updateAt = BigInt.zero()
    entity.mintAt = BigInt.zero()
    entity.birthday = BigInt.zero()
    entity.items = []
    entity.numericVisibleTraits = BigInt.zero()
    entity.numericRawTraits = BigInt.zero()
    entity.constellation = 1
    entity.constellationBoost = 0
    entity.epochThemeBoost = 0
    entity.epochThemeBoostMultiplier = 1
    entity.diceCount = 0
    entity.epochRarityBoost = 0
    entity.baseRarityBoost = 0
    entity.attributePoints = 0
    entity.ap = 0
    entity.apUpdatedAt = BigInt.zero()
    entity.exp = BigInt.zero()
    entity.level = 1
    entity.lastLevelUpAt = BigInt.zero()
    entity.restingUntil = BigInt.zero()
    entity.baseAttributes = []
    entity.passes = []
    entity.nextLevelExp = BigInt.fromI32(100)
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
  // fix overflow when birthday timestamp < 0
  entity.birthday =
    info.getBirthday() > BigInt.fromU64(0x7fffffffffffffff)
      ? BigInt.fromU64(0x7fffffffffffffff)
          .minus(info.value3.bitAnd(BigInt.fromU64(0x7fffffffffffffff)))
          .plus(BigInt.fromI32(1))
          .times(BigInt.fromI32(-1))
      : info.getBirthday()
  let birthdayDate = new Date(entity.birthday.toI64() * 1000)
  entity.constellation = parseConstellation(birthdayDate)
  entity.legendary = info.getLegendary()
  entity.numericVisibleTraits = info.getTraits()
  entity.numericRawTraits = info.getTraits()
}
