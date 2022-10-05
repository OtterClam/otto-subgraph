import { Address, BigInt } from '@graphprotocol/graph-ts'
import { AdventureContract, Departure, Finish, Revive } from '../generated/Adventure/AdventureContract'
import { AdventurePass } from '../generated/schema'
import { ADVENTURE } from './Constants'
import { getOttoEntity, getOttoEntityId } from './Otto'

export function handleDeparture(event: Departure): void {
  const passEntity = getPass(event.params.passId)
  const pass = AdventureContract.bind(Address.fromString(ADVENTURE)).pass(event.params.passId)
  passEntity.locId = pass.locId
  passEntity.otto = getOttoEntityId(pass.ottoId)
  passEntity.departureAt = event.block.timestamp
  passEntity.canFinishedAt = pass.canFinishedAt
  passEntity.finishedAt = BigInt.zero()
  passEntity.seed = pass.seed
  passEntity.success = false
  passEntity.revived = false
  passEntity.exp = 0
  passEntity.ap = 0
  passEntity.tcp = 0
  passEntity.items = []
  passEntity.save()

  const otto = getOttoEntity(pass.ottoId)
  const passes = otto.passes
  passes.push(passEntity.id)
  otto.passes = passes
  otto.save()
}

export function handleFinish(event: Finish): void {
  const passEntity = getPass(event.params.passId)
  const pass = AdventureContract.bind(Address.fromString(ADVENTURE)).pass(event.params.passId)
  passEntity.finishedAt = event.block.timestamp
  passEntity.success = event.params.success
  passEntity.revived = false
  passEntity.exp = pass.rewards.exp.toI32()
  passEntity.ap = pass.rewards.ap.toI32()
  passEntity.tcp = pass.rewards.tcp.toI32()
  passEntity.items = pass.rewards.items
  passEntity.save()
}

export function handleRevive(event: Revive): void {
  const passEntity = getPass(event.params.passId)
  passEntity.success = true
  passEntity.revived = true
  passEntity.save()
}

function getPass(id: BigInt): AdventurePass {
  const entityId = 'ADVENTURE_PASS_' + id.toString()
  let entity = AdventurePass.load(entityId)
  if (entity == null) {
    entity = new AdventurePass(entityId)
  }
  return entity
}
