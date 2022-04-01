import { Address, BigInt } from '@graphprotocol/graph-ts'
import { Otto as OttoContract, Transfer as TransferEvent } from '../generated/Otto/Otto'
import { OttoV2 as OttoV2Contract } from '../generated/Otto/OttoV2'
import { Otto } from '../generated/schema'
import { OTTO, OTTO_V2_BLOCK } from './utils/Constants'

let PortalStatus = ['UNOPENED', 'OPENED', 'SUMMONED']

export function handleTransfer(event: TransferEvent): void {
  let tokenId = event.params.tokenId
  let entity = new Otto(event.address.toHexString() + '-' + tokenId.toString())
  entity.tokenId = tokenId
  entity.owner = event.params.to
  entity.updateAt = event.block.timestamp
  if (event.block.number <= BigInt.fromString(OTTO_V2_BLOCK)) {
    // v1
    let otto = OttoContract.bind(Address.fromString(OTTO))
    let tokenURI = otto.try_tokenURI(tokenId)
    entity.tokenURI = tokenURI.reverted ? '' : tokenURI.value
    entity.portalStatus = PortalStatus[0] // UNOPENED
    entity.mintAt = event.block.timestamp
    entity.canOpenAt = BigInt.fromU64(1649250000)
    entity.summonAt = BigInt.fromI32(0)
  } else {
    // v2
    let ottoV2 = OttoV2Contract.bind(Address.fromString(OTTO))
    entity.tokenURI = ottoV2.tokenURI(tokenId)
    let info = ottoV2.infos(tokenId)
    entity.portalStatus = PortalStatus[info.value5]
    entity.mintAt = info.value0
    entity.canOpenAt = info.value1
    entity.summonAt = info.value2
  }
  entity.save()
}
