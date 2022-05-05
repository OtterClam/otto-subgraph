import { log } from '@graphprotocol/graph-ts'
import { Otto, Trait, Slot } from '../generated/schema'
import { PFP } from './PFP'

const NUM_OTTO_TRAITS = 13

function loadOrCreateSlots(): Array<Slot> {
  let slots = new Array<Slot>()
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    let slotId = i.toString()
    let slot = Slot.load(slotId)
    if (slot == null) {
      slot = new Slot(slotId)
      log.info('slotId: {} created, maxCount = {}', [slotId, slot.maxCount.toString()])
    } else {
      log.info('slotId: {} loaded, maxCount = {}', [slotId, slot.maxCount.toString()])
    }
    slots.push(slot)
  }
  return slots
}

function loadOrCreateTraits(slots: Array<Slot>, codes: Array<i32>): Array<Trait> {
  let traits = new Array<Trait>()
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    let code = codes[i]
    let slotId = slots[i].id
    let firstCode = i32(PFP.toObject().get(slotId)!.toObject().get(code.toString())!.toI64())
    let traitId = slotId + '-' + firstCode.toString()
    let trait = Trait.load(traitId)
    if (trait == null) {
      log.info('traitId: {} created', [traitId])
      trait = new Trait(traitId)
      trait.slot = slotId
      trait.code = firstCode
    } else {
      log.info('traitId: {} loaded', [traitId])
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
    log.warning('{}: slot {} trait {} maxCount == trait.count {}', [otto.id, slot.id, trait.id, trait.count.toString()])
    let traits = slot.maxCountTraits
    traits.push(trait.id)
    slot.maxCountTraits = traits
  }
  if (trait.count > slot.maxCount) {
    log.warning('{}: slot {} trait {} change maxCount from {} to {}', [
      otto.id,
      slot.id,
      trait.id,
      slot.maxCount.toString(),
      trait.count.toString(),
    ])
    slot.maxCount = trait.count
    slot.maxCountTraits = [trait.id]
  }
}

function removeOttoFromTrait(slot: Slot, trait: Trait, otto: Otto): void {
  let ottos = trait.ottos
  let index = ottos.indexOf(otto.id)
  log.warning('{}: slot {} trait {} removeOttoFromTrait find otto index {}', [
    otto.id,
    slot.id,
    trait.id,
    index.toString(),
  ])
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
}

function collectChangedOttoIds(ids: Array<string>, trait: Trait, exclude: Otto): void {
  log.warning('collectChangedOttoIds ids {} ', [ids.toString()])
  for (let i = 0; i < trait.ottos.length; i++) {
    let ottoId = trait.ottos[i]
    if (ottoId == exclude.id) {
      log.warning('otto {} is excluded', [exclude.id])
      continue
    }
    if (ids.indexOf(ottoId) == -1) {
      log.warning('otto {} is collected', [ottoId])
      ids.push(ottoId)
    }
  }
}

function calculateOttoRarityScore(count: i32, maxCount: i32): i32 {
  if (maxCount == 0) {
    return 100
  } else {
    return 100 - (100 * count) / maxCount
  }
}

function updateOttoRarityScore(otto: Otto, slots: Array<Slot>): void {
  let totalRRS = 0
  for (let i = 0; i < otto.traits.length; i++) {
    let traitId = otto.traits[i]
    let trait = Trait.load(traitId)
    if (trait == null) {
      log.warning('{}: trait {} of otto(who need to be updated) not found, should not happened', [otto.id, traitId])
      continue
    }
    let rrs = calculateOttoRarityScore(trait.count, slots[i].maxCount)
    log.warning('{}: trait {} rrs {}', [otto.id, traitId, rrs.toString()])
    totalRRS += rrs
  }
  log.warning('{}: total rrs {}', [otto.id, totalRRS.toString()])
  otto.rrs = totalRRS
}

export function updateRRS(codes: Array<i32>, otto: Otto): void {
  log.info('{}: traits: {}', [otto.id, codes.toString()])
  let slots = loadOrCreateSlots()
  let newTraits = loadOrCreateTraits(slots, codes)
  let dirtyOttoIds = new Array<string>()
  let dirtyOldTraits = new Array<Trait>()

  if (otto.traits.length == 0) {
    // new otto created
    // add all traits
    // update all ottos in all traits
    log.info('{}: new traits', [otto.id])
    for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
      addOttoToTrait(slots[i], newTraits[i], otto)
      collectChangedOttoIds(dirtyOttoIds, newTraits[i], otto)
    }
  } else {
    // otto traits changed
    // update changed traits
    // update all ottos in all changed traits
    // let newTraits = new Array<string>()
    log.warning('old otto.traits: {}', [otto.traits.toString()])
    let oldTraits = loadOrCreateTraits(
      slots,
      otto.traits.map<i32>((id) => i32(Number.parseInt(id.split('-')[1]))),
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

  log.warning('dirty otto ids {}', [dirtyOttoIds.toString()])
  log.warning('dirty old traits {}', [dirtyOldTraits.map<string>((t) => t.id).toString()])

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
      log.warning('load dirty otto {} failed, should not happened {}', [id])
      continue
    }
    updateOttoRarityScore(dirtyOtto, slots)
    dirtyOtto.save()
  }
  otto.traits = newTraits.map<string>((t) => t.id)
  updateOttoRarityScore(otto, slots)
}
