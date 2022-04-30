import { Address, BigInt, store } from '@graphprotocol/graph-ts'
import {
  CreateProduct,
  DeleteProduct,
  OttopiaStoreContract,
  UpdateProduct,
} from '../generated/OttoStore/OttopiaStoreContract'
import { OttoProduct } from '../generated/schema'
import { OTTOPIA_STORE } from './Constants'

export function handleCreate(event: CreateProduct): void {
  let productId = event.params.id_
  let entity = getProductEntity(productId)
  updateEntity(entity, event.block.timestamp)
  entity.save()
}

export function handleUpdate(event: UpdateProduct): void {
  let productId = event.params.id_
  let entity = getProductEntity(productId)
  updateEntity(entity, event.block.timestamp)
  entity.save()
}

export function handleDelete(event: DeleteProduct): void {
  let productId = event.params.id_
  store.remove('OttoProduct', getEntityId(productId))
}

function getEntityId(productId: BigInt): string {
  return OTTOPIA_STORE + '-' + productId.toString()
}

function getProductEntity(productId: BigInt): OttoProduct {
  let id = getEntityId(productId)
  let entity = OttoProduct.load(id)
  if (entity == null) {
    entity = new OttoProduct(id)
    entity.productId = productId
  }
  return entity
}

function updateEntity(entity: OttoProduct, timestamp: BigInt): void {
  let store = OttopiaStoreContract.bind(Address.fromString(OTTOPIA_STORE))
  let product = store.products(entity.productId)
  entity.price = product.value0
  entity.discountPrice = product.value1
  entity.amount = product.value2.toI32()
  entity.type = product.value3
  entity.factory = store.factories(entity.productId)
  entity.updateAt = timestamp
}
