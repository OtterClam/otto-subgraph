import { log } from '@graphprotocol/graph-ts'
import { Otto, Trait, Slot } from '../generated/schema'
import { loadPFP } from './utils/PFP'

const NUM_OTTO_TRAITS = 13

function loadOrCreateSlots(): Array<Slot> {
  let slots = new Array<Slot>()
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    let slotId = 'ottopia_slot_' + i.toString()
    let slot = Slot.load(slotId)
    if (slot == null) {
      slot = new Slot(slotId)
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
    let firstCode = PFP.toObject()
      .get(i.toString())!
      .toObject()
      .get(code.toString())!
      .toObject()
      .get('first_code')!
      .toBigInt()
      .toI32()
    let brs = PFP.toObject()
      .get(i.toString())!
      .toObject()
      .get(code.toString())!
      .toObject()
      .get('brs')!
      .toBigInt()
      .toI32()
    let traitId = slotId + '-' + firstCode.toString()
    let trait = Trait.load(traitId)
    if (trait == null) {
      trait = new Trait(traitId)
      trait.slot = slotId
      trait.code = firstCode
      trait.brs = brs
    }
    traits.push(trait)
  }
  return traits
}

function addOttoToTrait(slot: Slot, trait: Trait, otto: Otto): void {
  let ottos = trait.ottos
  ottos.push(otto.id)
  trait.ottos = ottos
  trait.count++
  if (trait.count == slot.maxCount) {
    let traits = slot.maxCountTraits
    traits.push(trait.id)
    slot.maxCountTraits = traits
  }
  if (trait.count > slot.maxCount) {
    slot.maxCount = trait.count
    slot.maxCountTraits = [trait.id]
  }
  trait.rrs = calculateRRS(trait.count, slot.maxCount)
  log.warning('trait: {} rrs: {} count: {} maxCount: {} ', [
    trait.id,
    trait.rrs.toString(),
    trait.count.toString(),
    slot.maxCount.toString(),
  ])
}

function removeOttoFromTrait(slot: Slot, trait: Trait, otto: Otto): void {
  let ottos = trait.ottos
  let index = ottos.indexOf(otto.id)
  ottos.splice(index, 1)
  trait.ottos = ottos
  let oldCount = trait.count
  trait.count--
  if (oldCount == slot.maxCount) {
    let traits = slot.maxCountTraits
    let index = traits.indexOf(trait.id)
    traits.splice(index, 1)
    slot.maxCountTraits = traits
    if (traits.length == 0) {
      slot.maxCount = trait.count
    }
  }
  trait.rrs = calculateRRS(trait.count, slot.maxCount)
}

function collectChangedOttoIds(ids: Array<string>, trait: Trait, exclude: Otto): void {
  for (let i = 0; i < trait.ottos.length; i++) {
    let ottoId = trait.ottos[i]
    if (ottoId == exclude.id) {
      continue
    }
    if (ids.indexOf(ottoId) == -1) {
      ids.push(ottoId)
    }
  }
}

function calculateRRS(count: i32, maxCount: i32): i32 {
  if (maxCount == 0) {
    return 100
  } else {
    return 100 - (100 * count) / maxCount
  }
}

function updateOttoRarityScore(otto: Otto): void {
  let totalRRS = 0
  let totalBRS = 0
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
  }

  otto.brs = totalBRS
  otto.rrs = totalRRS
  otto.rarityScore = totalBRS + totalRRS
}

export function updateRarityScoreRanking(codes: Array<i32>, otto: Otto): void {
  let slots = loadOrCreateSlots()
  let newTraits = loadOrCreateTraits(slots, codes)
  let dirtyOttoIds = new Array<string>()
  let dirtyOldTraits = new Array<Trait>()

  if (otto.traits.length == 0) {
    // new otto created
    // add all traits
    // update all ottos in all traits
    for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
      addOttoToTrait(slots[i], newTraits[i], otto)
      collectChangedOttoIds(dirtyOttoIds, newTraits[i], otto)
    }
  } else {
    // otto traits changed
    // update changed traits
    // update all ottos in all changed traits
    let oldTraits = loadOrCreateTraits(
      slots,
      otto.traits.map<i32>(id => i32(Number.parseInt(id.split('-')[1]))),
    )
    for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
      if (!newTraits[i].ottos.includes(otto.id)) {
        addOttoToTrait(slots[i], newTraits[i], otto)
        removeOttoFromTrait(slots[i], oldTraits[i], otto)
        dirtyOldTraits.push(oldTraits[i])
        collectChangedOttoIds(dirtyOttoIds, newTraits[i], otto)
        collectChangedOttoIds(dirtyOttoIds, oldTraits[i], otto)
      }
    }
    oldTraits = newTraits
  }

  // update all changed traits
  for (let i = 0; i < dirtyOldTraits.length; i++) {
    let dirtyTrait = dirtyOldTraits[i]
    dirtyTrait.save()
  }
  // update all new slot & trait
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    slots[i].save()
    newTraits[i].save()
  }

  // update all changed otto
  for (let i = 0; i < dirtyOttoIds.length; i++) {
    let id = dirtyOttoIds[i]
    let dirtyOtto = Otto.load(id)
    if (dirtyOtto == null) {
      continue
    }
    updateOttoRarityScore(dirtyOtto)
    dirtyOtto.save()
  }
  otto.traits = newTraits.map<string>(t => t.id)
  updateOttoRarityScore(otto)
}
