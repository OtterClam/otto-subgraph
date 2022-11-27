import { Address, BigInt, JSONValue, log, TypedMap } from '@graphprotocol/graph-ts'
import { OttoV3Contract } from '../generated/Otto/OttoV3Contract'
import { Epoch, Otto, Slot, Trait } from '../generated/schema'
import {
  LATEST_TIMESTAMP,
  OTTO,
  OTTOPIA_RARITY_SCORE_RANKING_DURATION,
  OTTOPIA_RARITY_SCORE_RANKING_FIRST_EPOCH,
  OTTO_RARITY_SCORE_START_ID,
} from './Constants'
import { parseConstellation } from './utils/Constellation'
import { loadPFP } from './utils/PFP'

const NUM_OTTO_TRAITS = 13
const EPOCH_3_EXTEND_TS = 86400 * 2
const EPOCH_4_EXTEND_TS = 86400 * 2
const S1_END_EPOCH = 5
const RARITY_S2_START = 1663545600 // 2022-9-19 0:00 UTC
const S2_END_EPOCH = 9
const RARITY_S3_DURATION = 3 * 7 * 24 * 60 * 60 // 3 weeks
const RARITY_S3_START = 1669593600 // 2022-11-28 0:00 UTC

const THEME_BOOST_BASE = 60
const THEME_BOOST_MULTIPLIER = [100, 150, 170, 200, 250]
const EPOCH_THEME_BOOST_LABEL: Array<string[]> = [
  [],
  [],
  [],
  [],
  [],
  [],
  // epoch 6
  ['red', 'creature'],
  // epoch 7
  ['green', 'plant', 'green_thumb'],
  // epoch 8
  ['orange', 'spooky', 'halloween'],
  // epoch 9
  ['yellow', 'golden', 'food', 'fast-food'],
  // epoch 10 skip
  [],
  // epoch 11
  ['earth', 'adventure', 'egyptian'],
]
const CONSTELLATION_BOOST = 50

function getEpochThemeLabels(epoch: i32): Array<string> {
  if (epoch < EPOCH_THEME_BOOST_LABEL.length) {
    return EPOCH_THEME_BOOST_LABEL[epoch]
  }
  return []
}

function loadOrCreateSlots(): Array<Slot> {
  let slots = new Array<Slot>()
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    let slotId = 'ottopia_slot_' + i.toString()
    let slot = Slot.load(slotId)
    if (slot == null) {
      slot = new Slot(slotId)
      slot.maxCount = 0
      slot.topCountTraits = []
      slot.traits = []
      //   log.warning('slot created {}', [slotId])
      // } else {
      //   log.warning('slot loaded {}', [slotId])
    }
    slots.push(slot)
  }
  return slots
}

function loadOrCreateTraits(slots: Array<Slot>, codes: Array<i32>): Array<Trait> {
  let traits = new Array<Trait>()
  let PFP = loadPFP()
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    let code = codes[i]
    let slotId = slots[i].id
    let slotProps = PFP.toObject().get(i.toString())!.toArray()
    let firstCode = 0
    let traitJson: TypedMap<string, JSONValue> = new TypedMap()
    let brs = 0
    for (let j = 0; j < slotProps.length; j++) {
      firstCode = slotProps[j].toObject().get('first_code')!.toBigInt().toI32()
      let len = slotProps[j].toObject().get('length')!.toBigInt().toI32()
      if (code >= firstCode && code < firstCode + len) {
        traitJson = slotProps[j].toObject()
        brs = traitJson.get('brs')!.toBigInt().toI32()
        break
      }
    }
    let traitId = slotId + '-' + firstCode.toString()
    let trait = Trait.load(traitId)
    if (trait == null) {
      trait = new Trait(traitId)
      trait.slot = slotId
      trait.code = firstCode
      trait.brs = brs
      trait.rrs = 0
      trait.count = 0
      trait.ottos = []
      const slotTraits = slots[i].traits
      slotTraits.push(trait.id)
      slots[i].traits = slotTraits

      let labels = new Array<string>()
      if (traitJson.get('labels') != null) {
        const labelArray = traitJson.get('labels')!.toArray()
        for (let k = 0; k < labelArray.length; k++) {
          labels.push(labelArray[k].toObject().get('v')!.toString())
        }
      }
      trait.labels = labels

      // log.warning('trait created {}', [traitId])
      // } else {
      //   log.warning('trait loaded {}', [traitId])
    }
    traits.push(trait)
  }
  return traits
}

function addOtto(trait: Trait, id: string): void {
  let ottos = trait.ottos
  ottos.push(id)
  trait.ottos = ottos
  trait.count++
}

function removeOtto(trait: Trait, id: string): void {
  let ottos = trait.ottos
  let index = ottos.indexOf(id)
  ottos.splice(index, 1)
  trait.ottos = ottos
  trait.count--
}

function addTopCountTrait(slot: Slot, trait: Trait): void {
  let topCountTraits = slot.topCountTraits
  topCountTraits.push(trait.id)
  slot.topCountTraits = topCountTraits
}

function replaceTopCountTrait(slot: Slot, trait: Trait): void {
  let topCountTraits = new Array<string>()
  topCountTraits.push(trait.id)
  slot.topCountTraits = topCountTraits
}

function removeTopCountTrait(slot: Slot, trait: Trait): void {
  let traits = slot.topCountTraits
  let index = traits.indexOf(trait.id)
  traits.splice(index, 1)
  slot.topCountTraits = traits
}

function replaceTopCountTraitByCount(slot: Slot, count: i32): void {
  let topCountTraits = new Array<string>()
  for (let i = 0; i < slot.traits.length; i++) {
    let traitId = slot.traits[i]
    let trait = Trait.load(traitId)
    if (trait != null && trait.count == count) {
      topCountTraits.push(traitId)
    }
  }
  slot.topCountTraits = topCountTraits
}

function collectOttoIds(ids: Array<string>, trait: Trait): void {
  for (let i = 0; i < trait.ottos.length; i++) {
    let ottoId = trait.ottos[i]
    if (ids.indexOf(ottoId) == -1) {
      ids.push(ottoId)
      //   log.warning('collect changed otto {}', [ottoId])
      // } else {
      //   log.warning('skip collecting changed otto {}', [ottoId])
    }
  }
}

function collectTrait(traits: Array<Trait>, trait: Trait): void {
  let traitIds = traits.map<string>((t) => t.id)
  if (traitIds.indexOf(trait.id) == -1) {
    traits.push(trait)
    //   log.warning('collect changed trait {}', [trait.id])
    // } else {
    //   log.warning('skip collecting changed trait {}', [trait.id])
  }
}

function collectTraitsInSlotExcept(traits: Array<Trait>, slot: Slot, skipped: Trait): void {
  for (let i = 0; i < slot.traits.length; i++) {
    let traitId = slot.traits[i]
    if (slot.traits[i] == skipped.id) {
      // log.warning('skip current trait {}', [traitId])
      continue
    }
    let trait = Trait.load(traitId)
    if (trait == null) {
      // log.warning('old trait {} not found, should not happen', [traitId])
      continue
    }
    collectTrait(traits, trait)
  }
}

function calculateRRS(count: i32, maxCount: i32): i32 {
  if (maxCount == 0) {
    return 100
  }
  return 100 - (100 * count) / maxCount
}

function calculateConstellationBoost(birthday: BigInt, epoch: i32): i32 {
  let boost = 0
  let ts = toEpochEndTimestamp(epoch)
  let competitionDate = new Date(ts.toI64() * 1000)
  let birthdayDate = new Date(birthday.toI64() * 1000)
  if (parseConstellation(competitionDate) == parseConstellation(birthdayDate)) {
    boost += CONSTELLATION_BOOST
  }
  if (
    competitionDate.getUTCMonth() == birthdayDate.getUTCMonth() &&
    competitionDate.getUTCDate() == birthdayDate.getUTCDate()
  ) {
    boost += 100
  }
  return boost
}

function calculateLegendaryBoost(otto: Otto): i32 {
  let boost = 0
  if (otto.items.length == 0 && otto.legendary) {
    boost = 100
  }
  return boost
}

function calculateEpochThemeBoost(otto: Otto, traits: Trait[], epoch: i32): i32 {
  const epochLabels = getEpochThemeLabels(epoch)
  let boost = 0
  let matchTraitCount = -1

  for (let i = 0; i < traits.length; i++) {
    let trait = traits[i]
    let match = false
    if (trait == null) {
      continue
    }
    for (let j = 0; j < trait.labels.length; j++) {
      if (epochLabels.indexOf(trait.labels[j]) !== -1) {
        boost += THEME_BOOST_BASE
        match = true
      }
    }
    if (match) {
      matchTraitCount++
    }
  }
  otto.epochThemeBoostMultiplier = matchTraitCount == -1 ? 1 : THEME_BOOST_MULTIPLIER[matchTraitCount]
  return (boost * otto.epochThemeBoostMultiplier) / 100
}

export function calculateOttoRarityScore(otto: Otto, epoch: i32): void {
  let totalBRS = otto.baseRarityBoost
  let epochBoost = otto.epochRarityBoost
  let totalRRS = 0
  let traits: Array<Trait> = []
  for (let i = 0; i < otto.traits.length; i++) {
    let traitId = otto.traits[i]
    let trait = Trait.load(traitId)
    if (trait == null) {
      continue
    }
    if (i == 9 || i == 12) {
      // i==9: coat of arms
      // i==12: gender
      continue
    }
    totalRRS += trait.rrs
    totalBRS += trait.brs
    traits.push(trait)
  }

  // log.warning('change otto {} rrs from {} to {}', [otto.id, otto.rrs.toString(), totalRRS.toString()])
  otto.legendaryBoost = calculateLegendaryBoost(otto)
  otto.constellationBoost = calculateConstellationBoost(otto.birthday, epoch)
  otto.epochThemeBoost = calculateEpochThemeBoost(otto, traits, epoch)
  otto.epochRarityBoost = epochBoost
  otto.brs = totalBRS + otto.constellationBoost + otto.legendaryBoost + epochBoost + otto.epochThemeBoost
  otto.rrs = totalRRS
  otto.rarityScore = otto.brs + otto.rrs
}

export function updateOrCreateOttoSnapshot(otto: Otto, epoch: i32): void {
  let id = otto.id + '-' + epoch.toString()
  let entity = new Otto(id)
  for (let i = 0; i < otto.entries.length; i++) {
    if (['id', 'epoch'].includes(otto.entries[i].key)) {
      continue
    }
    entity.set(otto.entries[i].key, otto.entries[i].value)
  }
  entity.epoch = epoch
  entity.save()
}

export function toEpoch(timestamp: BigInt): i32 {
  let ts = timestamp.toI32()
  let firstEpochTs = OTTOPIA_RARITY_SCORE_RANKING_FIRST_EPOCH
  let duration = OTTOPIA_RARITY_SCORE_RANKING_DURATION
  let s1EndTs = toEpochEndTimestamp(S1_END_EPOCH).toI32() // 2022-08-19
  let s2EndTs = toEpochEndTimestamp(S2_END_EPOCH).toI32() // 2022-11-14

  // log.warning('toEpoch ts {}, firstEpochTs {}, duration {}', [
  //   ts.toString(),
  //   firstEpochTs.toString(),
  //   duration.toString(),
  // ])
  if (ts < firstEpochTs) {
    return 0
  } else if (ts >= RARITY_S2_START) {
    return (ts - RARITY_S2_START) / duration + S1_END_EPOCH + 1
  } else if (ts >= s1EndTs && ts < RARITY_S2_START) {
    return S1_END_EPOCH + 1
  } else if (ts >= RARITY_S3_START) {
    return (ts - RARITY_S3_START) / RARITY_S3_DURATION + S2_END_EPOCH + 2
  } else if (ts >= s2EndTs && ts < RARITY_S3_START) {
    return S2_END_EPOCH + 1
  } else if (ts >= firstEpochTs && ts < firstEpochTs + 3 * duration) {
    return (ts - firstEpochTs) / duration
  } else if (ts >= firstEpochTs + 3 * duration && ts < firstEpochTs + EPOCH_3_EXTEND_TS + 4 * duration) {
    return 3
  } else if (
    ts >= firstEpochTs + EPOCH_3_EXTEND_TS + 4 * duration &&
    ts < firstEpochTs + EPOCH_3_EXTEND_TS + EPOCH_4_EXTEND_TS + 5 * duration
  ) {
    return 4
  } else {
    return (ts - firstEpochTs - EPOCH_3_EXTEND_TS - EPOCH_4_EXTEND_TS) / duration
  }
}

function toEpochEndTimestamp(epoch: i32): BigInt {
  let firstEpochTs = OTTOPIA_RARITY_SCORE_RANKING_FIRST_EPOCH
  let duration = OTTOPIA_RARITY_SCORE_RANKING_DURATION
  if (epoch > S1_END_EPOCH) {
    return BigInt.fromI64(RARITY_S2_START + duration * (epoch - S1_END_EPOCH))
  } else if (epoch > S2_END_EPOCH) {
    if (epoch == S2_END_EPOCH + 1) {
      return BigInt.fromI64(RARITY_S3_START)
    } else {
      return BigInt.fromI64(RARITY_S3_START + RARITY_S3_DURATION * (epoch - S2_END_EPOCH - 1))
    }
  } else if (epoch < 3) {
    return BigInt.fromI64(firstEpochTs + duration * (epoch + 1))
  } else if (epoch == 3) {
    return BigInt.fromI64(firstEpochTs + EPOCH_3_EXTEND_TS + duration * (epoch + 1))
  } else {
    return BigInt.fromI64(firstEpochTs + EPOCH_3_EXTEND_TS + EPOCH_4_EXTEND_TS + duration * (epoch + 1))
  }
}

export function updateRarityScore(codes: Array<i32>, otto: Otto, timestamp: BigInt): void {
  let epoch = toEpoch(timestamp)
  let slots = loadOrCreateSlots()
  let newTraits = loadOrCreateTraits(slots, codes)
  let dirtyOldTraits = new Array<Trait>()
  if (otto.traits.length == 0) {
    // new otto created
    // add all traits
    // update all ottos in all traits
    // log.warning('============= ADD TRAIT {}', [otto.id])
    for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
      let slot = slots[i]
      let newTrait = newTraits[i]
      addOtto(newTrait, otto.id)
      if (newTrait.count > slot.maxCount) {
        replaceTopCountTrait(slot, newTrait)
        slot.maxCount++
        collectTraitsInSlotExcept(dirtyOldTraits, slot, newTrait)
      } else if (newTrait.count == slot.maxCount) {
        addTopCountTrait(slot, newTrait)
      }
      newTrait.rrs = calculateRRS(newTrait.count, slot.maxCount)
    }
  } else {
    // otto traits changed
    // update changed traits
    // update all ottos in all changed traits
    let oldTraits = loadOrCreateTraits(
      slots,
      otto.traits.map<i32>((id) => i32(Number.parseInt(id.split('-')[1]))),
    )
    // log.warning('============= CHANGE TRAIT {}', [otto.id])
    for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
      if (!newTraits[i].ottos.includes(otto.id)) {
        let slot = slots[i]
        let oldTrait = oldTraits[i]
        let newTrait = newTraits[i]

        let oldTraitCount = oldTrait.count
        addOtto(newTrait, otto.id)
        removeOtto(oldTrait, otto.id)
        // 3,2 => 2,3
        if (oldTraitCount == slot.maxCount && newTrait.count == slot.maxCount) {
          removeTopCountTrait(slot, oldTrait)
          addTopCountTrait(slot, newTrait)
          collectTrait(dirtyOldTraits, oldTrait)
          newTrait.rrs = calculateRRS(newTrait.count, slot.maxCount)
          continue
        }
        // 4,1 => 3,2
        if (oldTraitCount == slot.maxCount) {
          removeTopCountTrait(slot, oldTrait)
          collectTrait(dirtyOldTraits, oldTrait)
          if (slot.topCountTraits.length == 0) {
            slot.maxCount--
            replaceTopCountTraitByCount(slot, slot.maxCount)
            addTopCountTrait(slot, oldTrait)
            // 4,2 => 3,3
            if (newTrait.count == slot.maxCount) {
              addTopCountTrait(slot, newTrait)
            }
            collectTraitsInSlotExcept(dirtyOldTraits, slot, newTrait)
          }
          newTrait.rrs = calculateRRS(newTrait.count, slot.maxCount)
          continue
        }
        if (newTrait.count > slot.maxCount) {
          replaceTopCountTrait(slot, newTrait)
          slot.maxCount++
          collectTraitsInSlotExcept(dirtyOldTraits, slot, newTrait)
        } else if (newTrait.count == slot.maxCount) {
          addTopCountTrait(slot, newTrait)
        }
        newTrait.rrs = calculateRRS(newTrait.count, slot.maxCount)
      }
    }
    oldTraits = newTraits
  }

  // log.warning(' dirty trais ids: {}', [dirtyOldTraits.map<string>((t) => t.id).join(', ')])
  // log.warning('handleTraitsChanged, dirty trait count: {}', [dirtyOldTraits.length.toString()])

  // update all changed traits
  for (let i = 0; i < dirtyOldTraits.length; i++) {
    let dirtyTrait = dirtyOldTraits[i]
    let slotIndex = i32(Number.parseInt(dirtyTrait.id.split('-')[0].split('_')[2]))
    let slot = slots[slotIndex]
    dirtyTrait.rrs = calculateRRS(dirtyTrait.count, slot.maxCount)
    dirtyTrait.save()
  }

  // update all new slot & trait
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    slots[i].save()
    newTraits[i].save()
  }

  // log.warning('current otto id: {}', [otto.id])

  otto.traits = newTraits.map<string>((t) => t.id)
  calculateOttoRarityScore(otto, epoch)
  updateOrCreateOttoSnapshot(otto, epoch)

  if (timestamp.toI32() < LATEST_TIMESTAMP) {
    return
  }

  let dirtyOttoIds = new Array<string>()
  for (let i = 0; i < dirtyOldTraits.length; i++) {
    let dirtyTrait = dirtyOldTraits[i]
    collectOttoIds(dirtyOttoIds, dirtyTrait)
  }

  // log.warning('dirty otto : {}', [dirtyOttoIds.join(', ')])
  // log.warning('handleTraitsChanged, dirty otto count: {}', [dirtyOttoIds.length.toString()])
  // update all changed otto
  for (let i = 0; i < dirtyOttoIds.length; i++) {
    let id = dirtyOttoIds[i]
    let dirtyOtto = Otto.load(id)
    if (dirtyOtto == null) {
      continue
    }
    calculateOttoRarityScore(dirtyOtto, epoch)
    updateOrCreateOttoSnapshot(dirtyOtto, epoch)
    dirtyOtto.save()
  }
}

export function updateOrCreateEpoch(timestamp: BigInt): boolean {
  let epoch = toEpoch(timestamp)
  let ottoV3 = OttoV3Contract.bind(Address.fromString(OTTO))
  let offset = BigInt.fromString(OTTO_RARITY_SCORE_START_ID).toI32()
  let total = ottoV3.totalSupply().toI32()

  let epochCreated = false
  let epochId = 'ottopia_epoch_' + epoch.toString()
  let epochEntity = Epoch.load(epochId)
  if (epochEntity == null) {
    epochCreated = true
    // log.warning('create epoch: {}', [epochId])
    epochEntity = new Epoch(epochId)
    epochEntity.num = epoch
    epochEntity.ottosSynced = false
    epochEntity.themeLabels = getEpochThemeLabels(epoch)
    epochEntity.themeBoostBase = THEME_BOOST_BASE
    if (epoch > S1_END_EPOCH) {
      // season 2
      epochEntity.startedAt = RARITY_S2_START
      epochEntity.endedAt = toEpochEndTimestamp(epoch).toI32()
    } else if (epoch == 0) {
      epochEntity.startedAt = OTTOPIA_RARITY_SCORE_RANKING_FIRST_EPOCH
      epochEntity.endedAt = toEpochEndTimestamp(epoch).toI32()
    } else {
      epochEntity.startedAt = toEpochEndTimestamp(epoch - 1).toI32()
      epochEntity.endedAt = toEpochEndTimestamp(epoch).toI32()
    }

    epochEntity.constellationBoost = CONSTELLATION_BOOST
    epochEntity.constellation = parseConstellation(new Date(i64(epochEntity.endedAt) * 1000))

    for (let i = offset; i < total; i++) {
      let id = OTTO + '-' + i.toString()
      let otto = Otto.load(id)
      if (otto == null) {
        log.critical('otto not found: {}', [id])
        continue
      }
      if (epoch > 0) {
        calculateOttoRarityScore(otto, epoch - 1)
        updateOrCreateOttoSnapshot(otto, epoch - 1)
      }
    }
  } else if (timestamp.toI32() >= LATEST_TIMESTAMP && !epochEntity.ottosSynced) {
    // log.warning('sync all ottos {} in latest epoch: {}', [total.toString(), epoch.toString()])
    for (let i = offset; i < total; i++) {
      let id = OTTO + '-' + i.toString()
      let otto = Otto.load(id)
      if (otto == null) {
        log.critical('otto not found: {}', [id])
        continue
      }
      calculateOttoRarityScore(otto, epoch)
      otto.save()
    }
    epochEntity.ottosSynced = true
  }
  epochEntity.totalOttos = total
  epochEntity.save()
  return epochCreated
}

export function createSnapshotsForAllOttos(timestamp: BigInt): void {
  let epoch = toEpoch(timestamp)
  let ottoV3 = OttoV3Contract.bind(Address.fromString(OTTO))
  let offset = BigInt.fromString(OTTO_RARITY_SCORE_START_ID).toI32()
  let total = ottoV3.totalSupply().toI32()
  // log.warning('createSnapshotsForAllOttos, epoch created: {}, total: {}', [epoch.toString(), total.toString()])
  for (let i = offset; i < total; i++) {
    let id = OTTO + '-' + i.toString()
    let otto = Otto.load(id)
    if (otto == null) {
      log.critical('otto not found: {}', [id])
      continue
    }
    // log.warning('create snapshot for otto: {}', [otto.id])
    // clear epoch rarity boost when new epoch starts
    otto.epochRarityBoost = 0
    otto.diceCount = 0
    otto.ap = 0
    otto.apRank = BigInt.zero()
    calculateOttoRarityScore(otto, epoch)
    otto.save()
    updateOrCreateOttoSnapshot(otto, epoch)
  }
}
