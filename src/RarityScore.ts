import { log } from '@graphprotocol/graph-ts'
import { Otto, Trait } from '../generated/schema'
import { PFP } from './PFP'

const NUM_OTTO_TRAITS = 13

function loadOrCreateTrait(slot: i32, code: i32): Trait {
  let firstCode = i32(PFP.toObject().get(slot.toString())!.toObject().get(code.toString())!.toI64())
  let traitId = slot.toString() + '-' + firstCode.toString()
  let entity = Trait.load(traitId)
  if (entity == null) {
    log.warning('traitId: {} created', [traitId])
    entity = new Trait(traitId)
    entity.slot = slot
    entity.code = firstCode
  } else {
    log.warning('traitId: {} loaded', [traitId])
  }
  return entity
}

export function updateTrait(codes: Array<i32>, otto: Otto): void {
  log.warning('{}: traits: {}', [otto.id, codes.toString()])
  let traits = otto.traits
  if (traits.length == 0) {
    for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
      let traitEntity = loadOrCreateTrait(i, codes[i])
      addOttoToTrait(traitEntity, otto)
      traitEntity.save()
      traits.push(traitEntity.id)
      log.warning('{}: add traits', [otto.id, traitEntity.id])
    }
  } else {
    let newTraits = new Array<string>()
    for (let i = 0; i < NUM_OTTO_TRAITS; i++) {
      let newTrait = loadOrCreateTrait(i, codes[i])
      if (!newTrait.ottos.includes(otto.id)) {
        addOttoToTrait(newTrait, otto)
        newTrait.save()

        let oldTraitId = traits[i]
        let oldTrait = Trait.load(oldTraitId)
        if (oldTrait != null) {
          log.warning('{}: trait from {} to {}', [otto.id, oldTrait.id, newTrait.id])
          removeOttoFromTrait(oldTrait, otto)
          oldTrait.save()
        }
      }
      newTraits.push(newTrait.id.toString())
    }
    traits = newTraits
  }

  otto.traits = traits
}

function addOttoToTrait(trait: Trait, otto: Otto): void {
  let ottos = trait.ottos
  ottos.push(otto.id)
  trait.ottos = ottos
  trait.count++
}

function removeOttoFromTrait(trait: Trait, otto: Otto): void {
  let ottos = trait.ottos
  let index = ottos.indexOf(otto.id)
  ottos.splice(index, 1)
  trait.ottos = ottos
  trait.count--
}
