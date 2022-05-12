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
      log.warning('slot created {}', [slotId])
    } else {
      log.warning('slot loaded {}', [slotId])
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
    let brs = 0
    for (let j = 0; j < slotProps.length; j++) {
      firstCode = slotProps[j].toObject().get('first_code')!.toBigInt().toI32()
      let len = slotProps[j].toObject().get('length')!.toBigInt().toI32()
      if (code >= firstCode && code < firstCode + len) {
        brs = slotProps[j].toObject().get('brs')!.toBigInt().toI32()
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
      let slotTraits = slots[i].traits
      slotTraits.push(trait.id)
      slots[i].traits = slotTraits
      log.warning('trait created {}', [traitId])
    } else {
      log.warning('trait loaded {}', [traitId])
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
      log.warning('collect changed otto {}', [ottoId])
    } else {
      log.warning('skip collecting changed otto {}', [ottoId])
    }
  }
}

function collectTrait(traits: Array<Trait>, trait: Trait): void {
  let traitIds = traits.map<string>((t) => t.id)
  if (traitIds.indexOf(trait.id) == -1) {
    traits.push(trait)
    log.warning('collect changed trait {}', [trait.id])
  } else {
    log.warning('skip collecting changed trait {}', [trait.id])
  }
}

function collectTraitsInSlotExcept(traits: Array<Trait>, slot: Slot, skipped: Trait): void {
  for (let i = 0; i < slot.traits.length; i++) {
    let traitId = slot.traits[i]
    if (slot.traits[i] == skipped.id) {
      log.warning('skip current trait {}', [traitId])
      continue
    }
    let trait = Trait.load(traitId)
    if (trait == null) {
      log.warning('old trait {} not found, should not happen', [traitId])
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

  log.warning('change otto {} rrs from {} to {}', [otto.id, otto.rrs.toString(), totalRRS.toString()])
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
    log.warning('============= ADD TRAIT {}', [otto.id])
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
    log.warning('============= CHANGE TRAIT {}', [otto.id])
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

  log.warning('dirty trais ids: {}', [dirtyOldTraits.map<string>((t) => t.id).join(', ')])

  // update all changed traits
  for (let i = 0; i < dirtyOldTraits.length; i++) {
    let dirtyTrait = dirtyOldTraits[i]
    let slotIndex = i32(Number.parseInt(dirtyTrait.id.split('-')[0].split('_')[2]))
    let slot = slots[slotIndex]
    dirtyTrait.rrs = calculateRRS(dirtyTrait.count, slot.maxCount)
    dirtyTrait.save()
    collectOttoIds(dirtyOttoIds, dirtyTrait)
  }

  // update all new slot & trait
  for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
    slots[i].save()
    newTraits[i].save()
  }

  log.warning('dirty otto ids: {}', [dirtyOttoIds.join(', ')])
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

  log.warning('current otto id: {}', [otto.id])

  otto.traits = newTraits.map<string>((t) => t.id)
  updateOttoRarityScore(otto)
}
