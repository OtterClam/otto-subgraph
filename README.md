# otter-subgraph

## Development

1. `docker-compose up -d`
2. `yarn`
3. `yarn codegen`
4. `yarn build`
5. `yarn create-local`
6. `yarn deploy-local`

## Fork

1. `git clone https://github.com/graphprotocol/graph-node`
2. `docker-compose up -d`
3. Spin up local node `cargo run -p graph-node --release -- \ --postgres-url postgresql://graph-node:let-me-in@localhost:5432/graph-node \ --ethereum-rpc matic:full:https://polygon-mainnet.infura.io/v3/{key} \ --ipfs 127.0.0.1:5001`
4. yarn deploy:fork

Ref: [https://thegraph.com/docs/en/cookbook/subgraph-debug-forking/](https://thegraph.com/docs/en/cookbook/subgraph-debug-forking/)

## Deploy

1. `yarn auth` and paste your token.
2. `yarn deploy`
