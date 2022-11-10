import { Address, BigInt } from '@graphprotocol/graph-ts'
import {
  AdventureContract,
  AdventureContract__passResultValue0Struct,
  Departure,
  Finish,
  PassUpdated,
  RestingUntilUpdated,
  Revive,
} from '../generated/Adventure/AdventureContract'
import { AdventurePass } from '../generated/schema'
import { ADVENTURE } from './Constants'
import { getOttoEntity, getOttoEntityId } from './Otto'

export function handleDeparture(event: Departure): void {
  const passEntity = getPassEntity(event.params.passId)
  const pass = getPass(event.params.passId)
  passEntity.locId = pass.locId
  passEntity.otto = getOttoEntityId(pass.ottoId)
  passEntity.departureAt = event.block.timestamp
  passEntity.canFinishAt = pass.canFinishAt
  passEntity.finishedAt = BigInt.zero()
  passEntity.seed = pass.seed
  passEntity.success = false
  passEntity.revived = false
  passEntity.exp = BigInt.zero()
  passEntity.ap = BigInt.zero()
  passEntity.tcp = BigInt.zero()
  passEntity.expMultiplier = pass.expMultiplier.toI32()
  passEntity.itemAmountMultiplier = pass.itemAmountMultiplier.toI32()
  passEntity.items = []
  passEntity.save()

  const otto = getOttoEntity(pass.ottoId)
  const passes = otto.passes
  passes.push(passEntity.id)
  otto.passes = passes
  otto.latestPass = passEntity.id
  otto.passesCount += 1
  otto.save()
}

export function handleFinish(event: Finish): void {
  const pass = getPass(event.params.passId)
  const passEntity = getPassEntity(event.params.passId)
  passEntity.finishedAt = event.block.timestamp
  passEntity.success = event.params.success
  passEntity.revived = false
  passEntity.exp = pass.rewards.exp
  passEntity.ap = pass.rewards.ap
  passEntity.tcp = pass.rewards.tcp
  passEntity.items = pass.rewards.items
  passEntity.finishedTx = event.transaction.hash.toHexString()
  passEntity.save()

  const otto = getOttoEntity(pass.ottoId)
  otto.finishedPassesCount += 1
  if (event.params.success) {
    otto.succeededPassesCount += 1
  }
}

export function handleRevive(event: Revive): void {
  const passEntity = getPassEntity(event.params.passId)
  passEntity.revived = true
  passEntity.save()
}

export function handlePassUpdated(event: PassUpdated): void {
  const pass = getPass(event.params.passId)
  const passEntity = getPassEntity(event.params.passId)

  passEntity.canFinishAt = pass.canFinishAt
  passEntity.expMultiplier = pass.expMultiplier.toI32()
  passEntity.itemAmountMultiplier = pass.itemAmountMultiplier.toI32()

  passEntity.save()
}

export function handleRestingUntilUpdated(event: RestingUntilUpdated): void {
  const otto = getOttoEntity(event.params.ottoId)
  otto.restingUntil = event.params.restingUntil
  otto.updateAt = event.block.timestamp
  otto.save()
}

function getPass(id: BigInt): AdventureContract__passResultValue0Struct {
  return AdventureContract.bind(Address.fromString(ADVENTURE)).pass(id)
}

function getPassEntity(id: BigInt): AdventurePass {
  const entityId = 'ADVENTURE_PASS_' + id.toString()
  let entity = AdventurePass.load(entityId)
  if (entity == null) {
    entity = new AdventurePass(entityId)
    entity.passId = id
    entity.locId = BigInt.zero()
    entity.otto = ''
    entity.departureAt = BigInt.zero()
    entity.canFinishAt = BigInt.zero()
    entity.finishedAt = BigInt.zero()
    entity.seed = BigInt.zero()
    entity.success = false
    entity.revived = false
    entity.exp = BigInt.zero()
    entity.ap = BigInt.zero()
    entity.tcp = BigInt.zero()
    entity.expMultiplier = 1
    entity.itemAmountMultiplier = 1
    entity.items = []
  }
  return entity
}
