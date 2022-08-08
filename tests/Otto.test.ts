import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { assert, clearStore, createMockedFunction, describe, newMockEvent, test } from 'matchstick-as/assembly/index'
import { TraitsChanged } from '../generated/Otto/OttoV2Contract'
import { LATEST_TIMESTAMP, OTTO, OTTOPIA_RARITY_SCORE_RANKING_DURATION } from '../src/Constants'
import { getOttoEntity, handleTraitsChanged } from '../src/Otto'

function createTraitsChangedEvent(id: BigInt, traits: Array<i32>): TraitsChanged {
  let mockEvent = newMockEvent()
  let event = new TraitsChanged(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
    mockEvent.receipt,
  )
  event.parameters = []
  let tokenId = new ethereum.EventParam('tokenId_', ethereum.Value.fromUnsignedBigInt(id))
  let arr = new ethereum.EventParam('arr_', ethereum.Value.fromI32Array(traits))
  event.parameters.push(tokenId)
  event.parameters.push(arr)
  return event
}
describe('handleTraitsChanged', () => {
  test('should able to update rarity score', () => {
    const token0 = BigInt.fromI32(0)
    const token1 = BigInt.fromI32(1)
    const token2 = BigInt.fromI32(2)
    const token3 = BigInt.fromI32(3)
    const event0 = createTraitsChangedEvent(token0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 0, 0])
    const event1 = createTraitsChangedEvent(token1, [64, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 0, 0])
    const event2 = createTraitsChangedEvent(token2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 0, 0])
    const event3 = createTraitsChangedEvent(token3, [64, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 0, 0])
    getOttoEntity(token0).save()
    getOttoEntity(token1).save()
    getOttoEntity(token2).save()
    getOttoEntity(token3).save()
    createMockedFunction(Address.fromString(OTTO), 'totalSupply', 'totalSupply():(uint256)')
      .withArgs([])
      .returns([ethereum.Value.fromI32(4)])

    event0.block.timestamp = BigInt.fromI32(LATEST_TIMESTAMP)
    handleTraitsChanged(event0)
    event1.block.timestamp = BigInt.fromI32(LATEST_TIMESTAMP)
    handleTraitsChanged(event1)
    event2.block.timestamp = BigInt.fromI32(LATEST_TIMESTAMP)
    handleTraitsChanged(event2)

    assert.fieldEquals('Otto', OTTO + '-0', 'rrs', '0')
    assert.fieldEquals('Otto', OTTO + '-1', 'rrs', '50')
    assert.fieldEquals('Otto', OTTO + '-2', 'rrs', '0')
    assert.fieldEquals('Otto', OTTO + '-0-4', 'rrs', '0')
    assert.fieldEquals('Otto', OTTO + '-1-4', 'rrs', '50')
    assert.fieldEquals('Otto', OTTO + '-2-4', 'rrs', '0')

    let otto = getOttoEntity(token1)
    otto.diceCount = 100
    otto.epochRarityBoost = 100
    otto.save()
    assert.fieldEquals('Otto', OTTO + '-1', 'diceCount', '100')
    assert.fieldEquals('Otto', OTTO + '-1', 'epochRarityBoost', '100')

    event3.block.timestamp = BigInt.fromI32(LATEST_TIMESTAMP + OTTOPIA_RARITY_SCORE_RANKING_DURATION)
    handleTraitsChanged(event3)
    assert.fieldEquals('Otto', OTTO + '-1', 'diceCount', '0')
    assert.fieldEquals('Otto', OTTO + '-1', 'epochRarityBoost', '0')
    assert.fieldEquals('Otto', OTTO + '-1', 'rrs', '0')
    assert.fieldEquals('Otto', OTTO + '-1-5', 'rrs', '0')
    assert.fieldEquals('Otto', OTTO + '-1-4', 'rrs', '50')
    // logStore()
    clearStore()
  })
})
